import { Types } from 'mongoose';
import { Role } from '../src/authz/role';
import { MetricsServer } from '../src/observability/metrics-server';
import { AuthMetrics } from '../src/observability/auth-metrics';
import { bootHttpApp, ORIGIN, TEST_PASSWORD, type HttpHarness } from './support/http-app';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface AuditDoc {
  readonly evento: string;
  readonly correlation_id: string | null;
}

/**
 * T-47 (DEC-25): correlationId en respuesta, log y auditoría, también en envíos diferidos; métricas sin
 * datos personales ni secretos y endpoint de métricas fuera de la API pública.
 */
describe('observabilidad de la API de autenticación (T-47, e2e)', () => {
  let h: HttpHarness;
  const institucion = new Types.ObjectId();
  const output: string[] = [];
  let restore: (() => void) | undefined;

  const post = (path: string, body: Record<string, unknown>) =>
    h.http().post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body);
  const audit = () => h.connection.db!.collection<AuditDoc>('auditoria_auth');
  const until = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 200 && !(await check()); i += 1) await new Promise((r) => setTimeout(r, 10));
  };
  const jsonLines = () =>
    output
      .join('')
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l) as Record<string, unknown>);

  beforeAll(async () => {
    h = await bootHttpApp('e2e_observability', { env: { RATE_LIMIT_REGISTER_IP: '1000/1h', RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT: '2/15m' } });
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    restore = () => {
      out.mockRestore();
      err.mockRestore();
    };
  }, 60_000);

  afterAll(async () => {
    restore?.();
    await h?.close();
  });

  it('cada respuesta lleva un X-Request-Id UUID generado en el servidor; los valores del cliente se ignoran', async () => {
    const malicious = ['../../etc/passwd', 'x'.repeat(500), '00000000-0000-4000-8000-000000000000', 'a b'];
    const ids = new Set<string>();
    for (const value of malicious) {
      const res = await h.http().get('/api/v1/health').set('X-Request-Id', value).expect(200);
      const id = res.headers['x-request-id'];
      expect(id).toMatch(UUID_V4);
      expect(id).not.toBe(value);
      ids.add(id);
    }
    const problem = await post('login', { correo: 'nadie@example.test', password: 'contraseña incorrecta larga' }).expect(401);
    expect(problem.headers['x-request-id']).toMatch(UUID_V4);
    ids.add(problem.headers['x-request-id']);
    expect(ids.size).toBe(malicious.length + 1);
    // Expuesta por CORS para que el frontend la pueda leer.
    expect(problem.headers['access-control-expose-headers']).toContain('X-Request-Id');
  });

  it('el mismo correlationId aparece en la respuesta, la auditoría y el log del envío diferido del correo', async () => {
    const correo = 'observable@example.test';
    const res = await post('register', { nombre: 'Observable', correo, password: TEST_PASSWORD }).expect(202);
    const id = res.headers['x-request-id'];
    await h.waitForMail(1);
    await until(() => Promise.resolve(jsonLines().some((l) => String(l.message).includes('Correo enviado') && l.correlationId === id)));
    const registro = await audit().findOne({ evento: 'REGISTRO', correlation_id: id });
    expect(registro).not.toBeNull();
    const mailLog = jsonLines().find((l) => String(l.message).includes('Correo enviado') && l.correlationId === id);
    expect(mailLog).toMatchObject({ level: 'log', context: 'MailDispatcher' });
    // El log no contiene el correo ni el enlace.
    expect(JSON.stringify(mailLog)).not.toContain(correo);
    expect(JSON.stringify(mailLog)).not.toContain('#token=');
  });

  it('un fallo SMTP diferido se audita (CORREO_NO_ENVIADO) con el correlationId de la solicitud que lo originó', async () => {
    h.mail.failNext = 1;
    const res = await post('register', { nombre: 'Falla', correo: 'falla.smtp@example.test', password: TEST_PASSWORD }).expect(202);
    const id = res.headers['x-request-id'];
    await until(async () => (await audit().countDocuments({ evento: 'CORREO_NO_ENVIADO', correlation_id: id })) === 1);
    expect(await audit().countDocuments({ evento: 'CORREO_NO_ENVIADO', correlation_id: id })).toBe(1);
  });

  it('solicitudes simultáneas conservan cada una su propio identificador en la auditoría', async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, i) => post('register', { nombre: `Par ${i}`, correo: `paralelo.${i}@example.test`, password: TEST_PASSWORD })),
    );
    const ids = responses.map((r) => r.headers['x-request-id']);
    expect(new Set(ids).size).toBe(8);
    for (const id of ids) expect(await audit().countDocuments({ evento: 'REGISTRO', correlation_id: id })).toBe(1);
  });

  it('métricas de login, desafío, 429, CAPTCHA y 503 sin correo, IP, identificadores, tokens ni contraseñas', async () => {
    const user = await h.createUser({ rol: Role.DOCENTE, institucionId: institucion });
    for (let i = 0; i < 2; i += 1) await post('login', { correo: user.correo, password: 'contraseña incorrecta larga' }).expect(401);
    await post('login', { correo: user.correo, password: user.password }).expect(401); // desafío
    h.captcha.mode = 'error';
    await post('login', { correo: user.correo, password: user.password, captchaToken: 'captcha-de-prueba-valido' }).expect(503);
    h.captcha.mode = 'disponible';
    const ok = await post('login', { correo: user.correo, password: user.password, captchaToken: 'captcha-de-prueba-valido' }).expect(200);
    await post('verify-email', { token: 'a'.repeat(43) }).expect(400);

    const text = await h.app.get(AuthMetrics).render();
    expect(text).toContain('omr_auth_solicitudes_total{ruta="/api/v1/auth/login",resultado="error_cliente",problema="credenciales-invalidas"}');
    expect(text).toContain('omr_auth_solicitudes_total{ruta="/api/v1/auth/login",resultado="error_cliente",problema="desafio-requerido"}');
    expect(text).toContain('omr_auth_solicitudes_total{ruta="/api/v1/auth/login",resultado="error_servidor",problema="verificacion-no-disponible"}');
    expect(text).toContain('omr_auth_solicitudes_total{ruta="/api/v1/auth/login",resultado="exito",problema="ninguno"}');
    expect(text).toContain('omr_auth_solicitudes_total{ruta="/api/v1/auth/verify-email",resultado="error_cliente",problema="enlace-invalido"}');
    expect(text).toContain('omr_auth_captcha_verificaciones_total{resultado="no_disponible"} 1');
    expect(text).toContain('omr_auth_captcha_verificaciones_total{resultado="valido"} 1');
    expect(text).toMatch(/omr_auth_correos_total\{resultado="enviado"\} \d+/);
    expect(text).toMatch(/omr_auth_argon2_en_curso \d+/);
    const forbidden = [user.correo, user.password, user.id.toHexString(), '127.0.0.1', '::ffff:', (ok.body as { accessToken: string }).accessToken, '@example.test', 'captcha-de-prueba-valido', TEST_PASSWORD];
    for (const value of forbidden) expect(text).not.toContain(value);
  }, 60_000);

  it('429 por límite se refleja con el tipo de problema', async () => {
    await h.resetRedis();
    const { max } = h.config.rateLimits.FORGOT_ACCOUNT;
    for (let i = 0; i <= max; i += 1) await post('password/forgot', { correo: 'limite.metricas@example.test' });
    const text = await h.app.get(AuthMetrics).render();
    expect(text).toMatch(/omr_auth_solicitudes_total\{ruta="\/api\/v1\/auth\/password\/forgot",resultado="error_cliente",problema="demasiados-intentos"\} [1-9]/);
  });

  it('las rutas inexistentes no crean series por URL', async () => {
    await h.http().get('/api/v1/auth/inexistente-12345').expect(404);
    const text = await h.app.get(AuthMetrics).render();
    expect(text).not.toContain('inexistente-12345');
    expect(text).toContain('ruta="desconocida"');
  });

  it('la API pública no expone métricas; el servidor interno sí, en otra dirección', async () => {
    for (const path of ['/metrics', '/api/v1/metrics', '/api/v1/auth/metrics']) {
      const res = await h.http().get(path);
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('omr_auth_');
    }
    const server = new MetricsServer(h.app.get(AuthMetrics));
    const { port } = await server.listen(0, '127.0.0.1');
    try {
      const res = await fetch(`http://127.0.0.1:${port}/metrics`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('omr_auth_solicitudes_total');
    } finally {
      await server.close();
    }
  });
});
