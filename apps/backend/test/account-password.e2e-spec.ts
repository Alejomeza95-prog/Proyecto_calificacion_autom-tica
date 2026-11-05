import { Types } from 'mongoose';
import { FORGOT_MESSAGE } from '../src/auth/auth.controller';
import { Role } from '../src/authz/role';
import { AccountStatus } from '../src/users/account-status';
import { bearer, bootHttpApp, ORIGIN, type HttpHarness } from './support/http-app';

const LINK = /http:\/\/localhost:5173\/restablecer-contrasena#token=([A-Za-z0-9_-]+)/;
const NEW_PASSWORD = 'otra frase nueva y bastante larga';
const INVALID_LINK = {
  type: 'urn:omr-preicfes:problema:enlace-invalido',
  title: 'El enlace no es válido o ya venció. Solicita uno nuevo',
  status: 400,
};

/**
 * T-18: `POST /auth/password/forgot` y `POST /auth/password/reset` (CA-08, CA-09, CA-10, RN-04, RN-08,
 * RN-16, RN-19; plan §5, §8; DEC-19, DEC-09).
 */
describe('recuperación y restablecimiento de contraseña (T-18, e2e)', () => {
  let h: HttpHarness;
  const institucion = new Types.ObjectId();
  const post = (path: string, body: Record<string, unknown>) =>
    h.http().post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body);
  const forgot = (correo: string) => post('password/forgot', { correo });
  const reset = (token: string, password = NEW_PASSWORD) => post('password/reset', { token, password });
  const docente = (estado: AccountStatus = AccountStatus.ACTIVA, correo?: string) =>
    h.createUser({ estado, rol: Role.DOCENTE, institucionId: institucion, ...(correo ? { correo } : {}) });
  const lastToken = (correo: string): string => {
    const mail = [...h.mail.sent].reverse().find((m) => m.to === correo && LINK.test(m.text));
    const match = LINK.exec(mail?.text ?? '');
    if (!match?.[1]) throw new Error('el correo no trae el enlace de restablecimiento');
    return match[1];
  };
  /** Solicita el enlace y devuelve el token capturado por el adaptador en memoria. */
  const requestLink = async (correo: string): Promise<string> => {
    const before = h.mail.sent.length;
    await forgot(correo).expect(202);
    await h.waitForMail(before + 1);
    return lastToken(correo);
  };
  const quiet = () => new Promise((r) => setTimeout(r, 50));
  const tokens = () => h.connection.db!.collection('tokens_seguridad');

  beforeAll(async () => {
    h = await bootHttpApp('e2e_password');
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    h.mail.clear();
  });

  it('CA-08/RN-04/DEC-19: el mismo 202, cuerpo y tiempo mínimo para un correo inexistente y los 5 estados; solo ACTIVA y PENDIENTE_APROBACION reciben enlace', async () => {
    const estados = [
      AccountStatus.ACTIVA,
      AccountStatus.PENDIENTE_APROBACION,
      AccountStatus.PENDIENTE_VERIFICACION,
      AccountStatus.BLOQUEADA,
      AccountStatus.DESACTIVADA,
    ];
    const cuentas = await Promise.all(estados.map((e) => docente(e, `estado.${e.toLowerCase()}@example.test`)));
    const correos = ['inexistente@example.test', ...cuentas.map((c) => c.correo)];
    const tokensBefore = await tokens().countDocuments({ proposito: 'RESTABLECER_PASSWORD' });

    const responses = [];
    for (const correo of correos) {
      const started = Date.now();
      const res = await forgot(correo);
      responses.push({ res, ms: Date.now() - started });
    }
    for (const { res, ms } of responses) {
      expect(res.status).toBe(202);
      expect(res.text).toBe(JSON.stringify({ mensaje: FORGOT_MESSAGE }));
      expect(res.headers['cache-control']).toBe('no-store');
      expect(ms).toBeGreaterThanOrEqual(h.config.authMinResponseMs - 5);
    }
    await h.waitForMail(2);
    await quiet();
    expect(h.mail.sent.map((m) => m.to).sort()).toEqual(
      ['estado.activa@example.test', 'estado.pendiente_aprobacion@example.test'].sort(),
    );
    expect(await tokens().countDocuments({ proposito: 'RESTABLECER_PASSWORD' })).toBe(tokensBefore + 2);
  });

  it('CA-09/RN-08/RN-16: reset → 204; sesiones previas revocadas (RESET_PASSWORD), versión +1; login con la nueva → 200 y con la anterior → 401; aviso por correo y auditoría', async () => {
    const user = await docente();
    const session = await h.login(user);
    const before = await h.usuarios.findById(user.id).lean().orFail();
    const token = await requestLink(user.correo);

    const res = await reset(token).expect(204);
    expect(res.text).toBe('');

    // La sesión previa deja de servir: el JWT y la cookie de renovación.
    await h.http().get('/api/v1/auth/me').set('Authorization', bearer(session.accessToken)).expect(401);
    await h.http().post('/api/v1/auth/refresh').set('Origin', ORIGIN).set('Cookie', session.cookie).expect(401);
    const sesiones = await h.connection.db!.collection('sesiones').find({ usuario_id: user.id }).toArray();
    expect(sesiones.length).toBeGreaterThan(0);
    expect(sesiones.every((s) => s.revocada_en instanceof Date && s.motivo_revocacion === 'RESET_PASSWORD')).toBe(true);
    const after = await h.usuarios.findById(user.id).lean().orFail();
    expect(after.version_credenciales).toBe(before.version_credenciales + 1);

    await h.login({ correo: user.correo, password: NEW_PASSWORD });
    await post('login', { correo: user.correo, password: user.password }).expect(401);

    await h.waitForMail(2);
    const notice = h.mail.sent.find((m) => m.to === user.correo && m.subject === 'Tu contraseña de OMR-PreICFES cambió');
    expect(notice).toBeDefined();
    expect(notice?.text).not.toMatch(/token=|http/);
    const audit = await h.connection.db!.collection('auditoria_auth').find({ evento: 'PASSWORD_RESTABLECIDO', usuario_id: user.id }).toArray();
    expect(audit).toEqual([expect.objectContaining({ resultado: 'OK' })]);
  });

  it('RN-19: reset de una cuenta PENDIENTE_APROBACION → 204 sin cambiar estado, rol ni institución', async () => {
    const user = await docente(AccountStatus.PENDIENTE_APROBACION);
    const token = await requestLink(user.correo);
    await reset(token).expect(204);
    const after = await h.usuarios.findById(user.id).lean().orFail();
    expect(after.estado).toBe(AccountStatus.PENDIENTE_APROBACION);
    expect(after.rol).toBe(Role.DOCENTE);
    expect(after.institucion_id?.toHexString()).toBe(institucion.toHexString());
  });

  it('RN-19: la cuenta se bloquea después de emitir el enlace → reset → 400 genérico, sin cambiar la contraseña ni revocar ni avisar', async () => {
    const user = await docente();
    const session = await h.login(user);
    const token = await requestLink(user.correo);
    await h.usuarios.updateOne({ _id: user.id }, { $set: { estado: AccountStatus.BLOQUEADA } });
    const hashBefore = (await h.usuarios.findById(user.id).select('+password_hash').lean().orFail()).password_hash;
    h.mail.clear();

    const res = await reset(token).expect(400);
    expect(res.body).toEqual(INVALID_LINK);
    const after = await h.usuarios.findById(user.id).select('+password_hash').lean().orFail();
    expect(after.password_hash).toBe(hashBefore);
    expect(after.estado).toBe(AccountStatus.BLOQUEADA);
    const sesion = await h.connection.db!.collection('sesiones').findOne({ usuario_id: user.id });
    expect(sesion?.motivo_revocacion ?? null).not.toBe('RESET_PASSWORD');
    await quiet();
    expect(h.mail.sent).toHaveLength(0);
    await h.http().post('/api/v1/auth/refresh').set('Origin', ORIGIN).set('Cookie', session.cookie).expect(401);
  });

  it('CA-10/RN-06: segundo uso, token inexistente, mal formado, vencido y reemplazado → el mismo 400', async () => {
    const user = await docente();
    const token = await requestLink(user.correo);
    await reset(token).expect(204);
    const second = await reset(token).expect(400);
    expect(second.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(second.body).toEqual(INVALID_LINK);
    expect((await reset('y'.repeat(43)).expect(400)).text).toBe(second.text);
    expect((await reset('no es un token').expect(400)).text).toBe(second.text);

    // Reemplazado: un segundo `forgot` invalida el enlace anterior; el nuevo funciona.
    const otro = await docente();
    const anterior = await requestLink(otro.correo);
    const nuevo = await requestLink(otro.correo);
    expect(nuevo).not.toBe(anterior);
    expect((await reset(anterior).expect(400)).text).toBe(second.text);
    await reset(nuevo).expect(204);

    // Vencido: reloj más allá de RESET_TOKEN_TTL.
    const tercero = await docente();
    const vencido = await requestLink(tercero.correo);
    h.clock.advance(h.config.ttl.resetTokenMs + 1_000);
    expect((await reset(vencido).expect(400)).text).toBe(second.text);
  });

  it('CA-10: 5 restablecimientos simultáneos con el mismo token → exactamente un 204 y el resto 400', async () => {
    const user = await docente();
    const token = await requestLink(user.correo);
    const max = h.config.rateLimits.RESET_TOKEN.max;
    const results = await Promise.all(Array.from({ length: max }, (_, i) => reset(token, `${NEW_PASSWORD} ${i}`)));
    expect(results.filter((r) => r.status === 204)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(max - 1);
    const after = await h.usuarios.findById(user.id).lean().orFail();
    expect(after.version_credenciales).toBe(1);
  }, 60_000);

  it('CA-03: contraseña fuera de política → 422 sin consumir el token', async () => {
    const user = await docente();
    const token = await requestLink(user.correo);
    const res = await reset(token, 'corta').expect(422);
    expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:politica-password' });
    await reset(token).expect(204);
  });

  it('CA-14: un forgot rechazado con 429 no emite token ni envía correo; correo existente e inexistente → mismo 429', async () => {
    const user = await docente();
    const { max, windowMs } = h.config.rateLimits.FORGOT_ACCOUNT;
    for (let i = 0; i < max; i += 1) await forgot(user.correo).expect(202);
    await h.waitForMail(max);
    const tokensBefore = await tokens().countDocuments();
    const mailsBefore = h.mail.sent.length;

    const existing = await forgot(user.correo).expect(429);
    expect(Number(existing.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(existing.headers['retry-after'])).toBeLessThanOrEqual(windowMs / 1000);
    for (let i = 0; i < max; i += 1) await forgot('nadie.limite@example.test').expect(202);
    const missing = await forgot('nadie.limite@example.test').expect(429);
    expect(missing.text).toBe(existing.text);
    await quiet();
    expect(h.mail.sent).toHaveLength(mailsBefore);
    expect(await tokens().countDocuments()).toBe(tokensBefore);
  }, 60_000);

  it('CA-14: reset por enlace existente → el intento siguiente al máximo → 429 con Retry-After', async () => {
    const user = await docente();
    const token = await requestLink(user.correo);
    const { max } = h.config.rateLimits.RESET_TOKEN;
    for (let i = 0; i < max; i += 1) await reset(token, 'corta').expect(422);
    // Los 422 se rechazan antes del límite y no consumen intentos; después, el máximo de intentos sobre
    // el mismo enlace (el primero lo consume y los siguientes → 400) y el siguiente → 429.
    for (let i = 0; i < max; i += 1) await reset(token, `${NEW_PASSWORD}`).expect(i === 0 ? 204 : 400);
    const limited = await reset(token).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  }, 60_000);

  it('DEC-09/RN-05/RN-12: ni el token ni la contraseña nueva aparecen en los logs, MongoDB, Redis ni la auditoría', async () => {
    const user = await docente();
    const output: string[] = [];
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    let token: string;
    try {
      token = await requestLink(user.correo);
      await reset(token).expect(204);
      await h.waitForMail(2);
      await quiet();
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    const logs = output.join('');
    // La captura recibió los logs del envío (la comprobación no es vacía).
    expect(logs).toContain('RESTABLECIMIENTO');
    for (const secret of [token, NEW_PASSWORD, user.correo]) expect(logs).not.toContain(secret);
    for (const name of ['tokens_seguridad', 'usuarios', 'sesiones', 'auditoria_auth']) {
      const dump = JSON.stringify(await h.connection.db!.collection(name).find().toArray());
      expect(dump).not.toContain(token);
      expect(dump).not.toContain(NEW_PASSWORD);
    }
    for (const key of await h.redisKeys()) {
      expect(key).not.toContain(token);
      expect((await h.redis.type(key)) === 'string' ? await h.redis.get(key) : '').not.toContain(token);
    }
  });

  it('DEC-21: propiedades no declaradas → 400 sin efectos', async () => {
    await post('password/forgot', { correo: 'a@example.test', estado: 'ACTIVA' }).expect(400);
    await post('password/reset', { token: 'x', password: NEW_PASSWORD, rol: 'ADMIN' }).expect(400);
    expect(await h.redisKeys('rl:*')).toEqual([]);
  });
});
