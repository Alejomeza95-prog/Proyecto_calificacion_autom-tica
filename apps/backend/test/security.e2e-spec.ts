import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import type { Response } from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { REFRESH_COOKIE } from '../src/auth/refresh-cookie';
import { Role } from '../src/authz/role';
import { sha256Hex } from '../src/security-tokens/security-tokens.service';
import { AccountStatus } from '../src/users/account-status';
import { bearer, bootHttpApp, ORIGIN, refreshCookieFrom, TEST_PASSWORD, type HttpHarness } from './support/http-app';

const NEW_PASSWORD = 'otra frase nueva y bastante larga';
const VERIFY_LINK = /\/verificar-correo#token=([A-Za-z0-9_-]+)/;
const RESET_LINK = /\/restablecer-contrasena#token=([A-Za-z0-9_-]+)/;

/** Las 10 rutas de `/api/v1/auth` de esta historia (plan §8). */
const ROUTES = [
  'GET me',
  'POST activate',
  'POST login',
  'POST logout',
  'POST password/forgot',
  'POST password/reset',
  'POST refresh',
  'POST register',
  'POST resend-verification',
  'POST verify-email',
];

function controllerRoutes(): string[] {
  const proto = AuthController.prototype as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .map((name) => proto[name])
    .filter((fn): fn is object => typeof fn === 'function' && fn !== AuthController)
    .filter((fn) => Reflect.getMetadata(PATH_METADATA, fn) !== undefined)
    .map((fn) => `${RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod]} ${String(Reflect.getMetadata(PATH_METADATA, fn))}`)
    .sort();
}

/**
 * T-31: suite de seguridad de la API de autenticación (CA-02, CA-08, CA-11, CA-12, CA-13, RN-02, RN-04,
 * RN-05, RN-06, RN-10, RN-12, RN-14, RN-15, RN-17, RN-18, RN-19, RNF-06). Solo backend (DEC-23).
 *
 * Partes cubiertas por suites dedicadas, sin duplicarlas aquí:
 * - RBAC y alcance institucional (otra institución → 404 idéntico a inexistente; rol insuficiente → 403;
 *   listados y actualizaciones filtrados; documento incoherente → 403; cambios de rol en la base aplican
 *   en la siguiente solicitud; CORS exacto) → `test/authz.e2e-spec.ts` (T-19).
 * - Rotación y reutilización de tokens de renovación, renovaciones simultáneas, cuenta no ACTIVA →
 *   `test/auth-session.e2e-spec.ts` (T-17) y `test/limits-expiry.e2e-spec.ts` (T-40).
 * - Límites y Redis caído en las 7 operaciones → `test/rate-limits.e2e-spec.ts` (T-13).
 * - Redacción de secretos en los logs de errores no previstos → `test/log-redaction.e2e-spec.ts` (T-10).
 * - Elegibilidad de la recuperación en los 5 estados (DEC-19) → `test/account-password.e2e-spec.ts` (T-18).
 */
describe('seguridad de la API de autenticación (T-31, e2e)', () => {
  let h: HttpHarness;
  const institucion = new Types.ObjectId();
  const post = (path: string, body: Record<string, unknown> = {}, origin: string | null = ORIGIN) => {
    const req = h.http().post(`/api/v1/auth/${path}`);
    if (origin !== null) req.set('Origin', origin);
    return req.send(body);
  };

  beforeAll(async () => {
    h = await bootHttpApp('e2e_security', { env: { RATE_LIMIT_REGISTER_IP: '1000/1h', RATE_LIMIT_FORGOT_IP: '1000/1h' } });
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    h.mail.clear();
  });

  it('inventario: exactamente las 10 rutas del plan §8, sin PUT, PATCH ni DELETE; ninguna recibe rol ni institución (RN-14, RN-18)', async () => {
    expect(controllerRoutes()).toEqual(ROUTES);
    const admin = await h.createUser({ rol: Role.ADMIN });
    const { accessToken } = await h.login(admin);
    // Intentos de autoasignarse o cambiar el propio rol, también como ADMIN: no existe ninguna ruta.
    for (const method of ['patch', 'put', 'delete'] as const) {
      for (const path of ['me', 'usuarios/me', 'rol', `usuarios/${admin.id.toHexString()}`]) {
        const res = await h.http()[method](`/api/v1/auth/${path}`).set('Origin', ORIGIN).set('Authorization', bearer(accessToken)).send({ rol: Role.DOCENTE });
        expect([403, 404]).toContain(res.status);
      }
    }
    await post('login', { correo: admin.correo, password: admin.password, rol: Role.DOCENTE }).expect(400);
    const doc = await h.usuarios.findById(admin.id).lean().orFail();
    expect(doc).toMatchObject({ rol: Role.ADMIN, institucion_id: null, version_credenciales: 0 });
  });

  it('RNF-06/DEC-20: matriz de Origin (ausente, null, ajeno, parcial, otro puerto, sufijo) en las 9 rutas POST → 403 sin efectos', async () => {
    const user = await h.createUser({ rol: Role.DOCENTE, institucionId: institucion });
    const session = await h.login(user);
    const before = {
      usuarios: await h.usuarios.countDocuments(),
      tokens: await h.connection.db!.collection('tokens_seguridad').countDocuments(),
      sesiones: await h.connection.db!.collection('sesiones').countDocuments({ revocada_en: null }),
    };
    await h.resetRedis();
    const origins: (string | null)[] = [null, 'null', 'https://evil.example.test', 'http://localhost', 'localhost:5173', 'http://localhost:5174', `${ORIGIN}.evil.test`, `${ORIGIN}/`];
    const bodies: Record<string, Record<string, unknown>> = {
      register: { nombre: 'Ana', correo: 'origen@example.test', password: TEST_PASSWORD },
      login: { correo: user.correo, password: user.password },
      'verify-email': { token: 'x'.repeat(43) },
      'resend-verification': { correo: user.correo },
      'password/forgot': { correo: user.correo },
      'password/reset': { token: 'x'.repeat(43), password: NEW_PASSWORD },
      activate: { token: 'x'.repeat(43), password: NEW_PASSWORD },
      refresh: {},
      logout: {},
    };
    for (const path of Object.keys(bodies)) {
      for (const origin of origins) {
        const req = h.http().post(`/api/v1/auth/${path}`).set('Authorization', bearer(session.accessToken)).set('Cookie', session.cookie);
        if (origin !== null) req.set('Origin', origin);
        const res = await req.send(bodies[path]);
        expect({ path, origin, status: res.status }).toEqual({ path, origin, status: 403 });
        expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:origen-no-permitido' });
        expect(res.headers['set-cookie']).toBeUndefined();
      }
    }
    expect(await h.redisKeys('rl:*')).toEqual([]);
    expect({
      usuarios: await h.usuarios.countDocuments(),
      tokens: await h.connection.db!.collection('tokens_seguridad').countDocuments(),
      sesiones: await h.connection.db!.collection('sesiones').countDocuments({ revocada_en: null }),
    }).toEqual(before);
    expect(h.mail.sent).toHaveLength(0);
    // Con el Origin permitido, la sesión sigue funcionando.
    await post('refresh', {}).set('Cookie', session.cookie).expect(200);
  }, 120_000);

  it('RN-04/CA-02/CA-08: sin enumeración — mismo estado, cuerpo, cabeceras relevantes y tiempo mínimo, exista o no la cuenta y cualquiera sea su estado', async () => {
    const estados = Object.values(AccountStatus);
    const cuentas = await Promise.all(estados.map((estado) => h.createUser({ estado, rol: Role.DOCENTE, institucionId: institucion })));
    const correos = [...cuentas.map((c) => c.correo), 'nadie.enumeracion@example.test'];

    const shape = (r: Response) => ({ status: r.status, text: r.text, type: r.headers['content-type'], cache: r.headers['cache-control'] });
    for (const [path, body] of [
      ['register', (correo: string) => ({ nombre: 'Ana', correo, password: TEST_PASSWORD })],
      ['resend-verification', (correo: string) => ({ correo })],
      ['password/forgot', (correo: string) => ({ correo })],
    ] as const) {
      const shapes = [];
      for (const correo of correos) {
        const started = performance.now();
        const res = await post(path, body(correo));
        expect(performance.now() - started).toBeGreaterThanOrEqual(h.config.authMinResponseMs - 5);
        shapes.push(shape(res));
      }
      expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(1);
      expect(shapes[0]?.status).toBe(202);
    }
    // Login: inexistente, contraseña incorrecta y cuentas no ACTIVA con la contraseña correcta → mismo 401.
    const logins = [
      await post('login', { correo: 'nadie.enumeracion@example.test', password: TEST_PASSWORD }),
      await post('login', { correo: cuentas[0].correo, password: 'contraseña incorrecta larga' }),
      ...(await Promise.all(
        cuentas.filter((_, i) => estados[i] !== AccountStatus.ACTIVA).map((c) => post('login', { correo: c.correo, password: c.password })),
      )),
    ];
    expect(new Set(logins.map((r) => JSON.stringify(shape(r)))).size).toBe(1);
    expect(logins[0]?.status).toBe(401);
    // Enlaces: inexistente, mal formado y de otro propósito → el mismo 400.
    const links = [
      await post('verify-email', { token: 'a'.repeat(43) }),
      await post('password/reset', { token: 'b'.repeat(43), password: NEW_PASSWORD }),
      await post('activate', { token: 'c'.repeat(43), password: NEW_PASSWORD }),
      await post('verify-email', { token: '%%%' }),
    ];
    expect(new Set(links.map((r) => r.text)).size).toBe(1);
  }, 120_000);

  it('cookies y sesión: la cookie de renovación es HttpOnly, Secure, SameSite=Strict, Path=/api/v1/auth y nunca va en el cuerpo; /me sin hashes (RN-05)', async () => {
    const user = await h.createUser({ rol: Role.DOCENTE, institucionId: institucion });
    const login = await post('login', { correo: user.correo, password: user.password }).expect(200);
    const refreshed = await post('refresh').set('Cookie', refreshCookieFrom(login.headers['set-cookie']).cookie).expect(200);
    for (const res of [login, refreshed]) {
      const { raw, cookie } = refreshCookieFrom(res.headers['set-cookie']);
      expect(raw).toMatch(/; HttpOnly/);
      expect(raw).toMatch(/; Secure/);
      expect(raw).toMatch(/; SameSite=Strict/);
      expect(raw).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(res.text).not.toContain(cookie.slice(REFRESH_COOKIE.length + 1));
      expect(res.headers['cache-control']).toBe('no-store');
    }
    const me = await h.http().get('/api/v1/auth/me').set('Authorization', bearer((refreshed.body as { accessToken: string }).accessToken)).expect(200);
    expect(Object.keys(me.body as object).sort()).toEqual(['estado', 'id', 'institucionId', 'nombre', 'rol']);
    expect(me.text).not.toMatch(/argon2|hash|password/i);
    // La sesión solo se autentica por la cookie en /refresh: el JWT no sirve como token de renovación.
    await post('refresh').set('Authorization', bearer((login.body as { accessToken: string }).accessToken)).expect(401);
  });

  it('RN-05/RN-06/RN-12: flujo completo sin secretos en respuestas, logs, auditoría, MongoDB ni Redis', async () => {
    const correo = 'flujo.seguro@example.test';
    const responses: Response[] = [];
    const output: string[] = [];
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    const secrets: string[] = [TEST_PASSWORD, NEW_PASSWORD];
    const refreshValues: string[] = [];
    const accessTokens: string[] = [];
    try {
      responses.push(await post('register', { nombre: 'Flujo Seguro', correo, password: TEST_PASSWORD }).expect(202));
      await h.waitForMail(1);
      const verifyToken = VERIFY_LINK.exec(h.mail.sent[0]?.text ?? '')?.[1] ?? '';
      responses.push(await post('verify-email', { token: verifyToken }).expect(200));
      // Aprobación administrativa (otra historia): se simula en la base.
      await h.usuarios.updateOne({ correo_normalizado: correo }, { $set: { estado: AccountStatus.ACTIVA, rol: Role.DOCENTE, institucion_id: institucion } });
      const login = await post('login', { correo, password: TEST_PASSWORD }).expect(200);
      responses.push(login);
      const c1 = refreshCookieFrom(login.headers['set-cookie']).cookie;
      const refreshed = await post('refresh').set('Cookie', c1).expect(200);
      responses.push(refreshed);
      const c2 = refreshCookieFrom(refreshed.headers['set-cookie']).cookie;
      responses.push(await post('password/forgot', { correo }).expect(202));
      await h.waitForMail(2);
      const resetToken = RESET_LINK.exec(h.mail.sent[1]?.text ?? '')?.[1] ?? '';
      responses.push(await post('password/reset', { token: resetToken, password: NEW_PASSWORD }).expect(204));
      const login2 = await post('login', { correo, password: NEW_PASSWORD }).expect(200);
      responses.push(login2);
      const access2 = (login2.body as { accessToken: string }).accessToken;
      responses.push(await h.http().get('/api/v1/auth/me').set('Authorization', bearer(access2)).expect(200));
      responses.push(await post('logout').set('Authorization', bearer(access2)).set('Cookie', refreshCookieFrom(login2.headers['set-cookie']).cookie).expect(204));
      await h.waitForMail(3);
      await new Promise((r) => setImmediate(r));
      refreshValues.push(...[c1, c2, refreshCookieFrom(login2.headers['set-cookie']).cookie].map((c) => c.slice(REFRESH_COOKIE.length + 1)));
      accessTokens.push((login.body as { accessToken: string }).accessToken, access2);
      secrets.push(verifyToken, resetToken, ...refreshValues);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    expect(secrets.every((s) => s.length >= 12)).toBe(true);
    const hashes = [...secrets.slice(2)].map(sha256Hex);
    const usuario = await h.usuarios.findOne({ correo_normalizado: correo }).select('+password_hash').lean().orFail();

    // Respuestas: ningún secreto, hash ni token crudo en cuerpos o cabeceras (salvo la cookie en Set-Cookie).
    for (const res of responses) {
      const headers = { ...res.headers, 'set-cookie': undefined };
      const visible = res.text + JSON.stringify(headers);
      for (const s of [...secrets, ...hashes, usuario.password_hash]) expect(visible).not.toContain(s);
    }
    // Logs reales del proceso (hubo salida: envíos de correo).
    const logs = output.join('');
    expect(logs).toContain('Correo enviado');
    for (const s of [...secrets, ...hashes, ...accessTokens, usuario.password_hash, correo]) expect(logs).not.toContain(s);
    // Auditoría: sin correo, contraseñas, tokens, hashes ni IP en claro.
    const audit = JSON.stringify(await h.connection.db!.collection('auditoria_auth').find().toArray());
    for (const s of [...secrets, ...hashes, ...accessTokens, usuario.password_hash, correo, '127.0.0.1']) expect(audit).not.toContain(s);
    // MongoDB: ningún secreto crudo ni JWT; las contraseñas solo como hash Argon2id.
    for (const { name } of await h.connection.db!.listCollections({}, { nameOnly: true }).toArray()) {
      const dump = JSON.stringify(await h.connection.db!.collection(name).find().toArray());
      for (const s of [...secrets, ...accessTokens]) expect({ name, found: dump.includes(s) }).toEqual({ name, found: false });
    }
    expect(usuario.password_hash).toMatch(/^\$argon2id\$/);
    // Redis: ni claves ni valores con secretos, hashes de tokens, correos o la IP.
    for (const key of await h.redisKeys()) {
      const value = (await h.redis.type(key)) === 'string' ? ((await h.redis.get(key)) ?? '') : '';
      for (const s of [...secrets, ...hashes, correo, '127.0.0.1']) expect(key + value).not.toContain(s);
    }
  }, 120_000);
});
