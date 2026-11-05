import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { PasswordHasher } from '../src/auth/password/password-hasher';
import { Role } from '../src/authz/role';
import { TestCaptchaVerifier } from '../src/captcha/captcha-verifier';
import { SecurityTokensService } from '../src/security-tokens/security-tokens.service';
import { TokenPurpose } from '../src/security-tokens/token-purpose';
import { AccountStatus } from '../src/users/account-status';
import { AccountOrigin } from '../src/users/usuario.schema';
import { bearer, bootHttpApp, ORIGIN, refreshCookieFrom, type HttpHarness } from './support/http-app';

const WRONG = 'contraseña equivocada larga';
const NEW_PASSWORD = 'frase nueva suficientemente larga';
const SECOND = 1_000;

/**
 * T-40: límites, vencimientos, reutilización y revocación con **reloj controlado** (`FakeClock` de la API)
 * y umbrales leídos de la configuración de cada suite (CA-04, CA-08, CA-09, CA-10, CA-14, CA-15, CA-16,
 * RN-06, RN-08, RN-09, RN-16, RNF-04; plan §12). Ninguna prueba espera ventanas reales: los vencimientos
 * de tokens y sesiones usan el reloj falso; la expiración de una clave de Redis se adelanta con `PEXPIRE`
 * tras comprobar que su TTL está dentro de la ventana.
 *
 * Casos obligatorios presentes en otras suites (sin duplicarlos aquí):
 * (e) tokens inventados sin claves `rl:{op}:registro:*` y (f) `activate` 6.º por enlace y 31.º por IP →
 *     `test/rate-limits.e2e-spec.ts`;
 * (g) reutilizar un token de renovación antiguo revoca la sesión completa → `test/auth-session.e2e-spec.ts`
 *     («rota la cookie A → B → C…»), y el restablecimiento revoca todas las sesiones →
 *     `test/account-password.e2e-spec.ts`;
 * (h) 10 renovaciones simultáneas → como máximo 1 éxito → `test/auth-session.e2e-spec.ts`.
 */

async function counter(h: HttpHarness, pattern: string): Promise<number> {
  const keys = (await h.redisKeys(pattern)).filter((k) => !k.endsWith(':auditado'));
  const values = await Promise.all(keys.map((k) => h.redis.get(k)));
  return values.reduce((sum, v) => sum + Number(v ?? 0), 0);
}

/** Adelanta el vencimiento de las claves (ventana corta simulada) y espera a que Redis las elimine. */
async function expireNow(h: HttpHarness, pattern: string): Promise<void> {
  const keys = await h.redisKeys(pattern);
  for (const k of keys) await h.redis.pexpire(k, 1);
  for (let i = 0; i < 100 && (await h.redisKeys(pattern)).length > 0; i += 1) await new Promise((r) => setImmediate(r));
  expect(await h.redisKeys(pattern)).toEqual([]);
}

function harnessHelpers(get: () => HttpHarness) {
  const institucion = new Types.ObjectId();
  return {
    post: (path: string, body: Record<string, unknown>) =>
      get().http().post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body),
    docente: (estado: AccountStatus = AccountStatus.ACTIVA) =>
      get().createUser({ estado, rol: Role.DOCENTE, institucionId: institucion }),
    ghost: () => `fantasma.${randomBytes(4).toString('hex')}@example.test`,
  };
}

describe('T-40: login con desafío, vencimientos y rotación (reloj controlado)', () => {
  let h: HttpHarness;
  const { post, docente, ghost } = harnessHelpers(() => h);

  beforeAll(async () => {
    h = await bootHttpApp('e2e_t40_a', {
      env: {
        RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT: '3/15m',
        RATE_LIMIT_LOGIN_IP_FAILURE: '500/15m',
        RATE_LIMIT_LOGIN_CHALLENGE_IP: '500/15m',
        SESSION_MAX_ROTATIONS: '3',
        ARGON2_QUEUE_MAX: '64',
        // Esperas amplias: (d) mide el conteo atómico de 20 fallos simultáneos, no la saturación ni el
        // fallo cerrado de Redis (cubiertos en rate-limits.e2e y en la suite de RNF-07).
        ARGON2_QUEUE_TIMEOUT_MS: '60000',
        RATE_LIMIT_REDIS_TIMEOUT_MS: '5000',
      },
    });
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    h.captcha.mode = 'disponible';
    jest.restoreAllMocks();
  });

  const fail = async (correo: string, times: number) => {
    for (let i = 0; i < times; i += 1) await post('login', { correo, password: WRONG }).expect(401);
  };

  it('(a) con el contador por cuenta en el umbral y el CAPTCHA resuelto, la contraseña correcta → 200', async () => {
    const user = await docente();
    await fail(user.correo, h.config.rateLimits.LOGIN_CHALLENGE_ACCOUNT.max);
    await post('login', { correo: user.correo, password: user.password, captchaToken: TestCaptchaVerifier.VALID_TOKEN }).expect(200);
  });

  it('(b) en el umbral, sin CAPTCHA → 401 desafio-requerido sin Argon2id, igual para un correo inexistente; nunca 429 por la cuenta', async () => {
    const user = await docente();
    const fantasma = ghost();
    const { max } = h.config.rateLimits.LOGIN_CHALLENGE_ACCOUNT;
    await fail(user.correo, max);
    await fail(fantasma, max);
    const hasher = h.app.get(PasswordHasher);
    const verify = jest.spyOn(hasher, 'verify');
    const dummy = jest.spyOn(hasher, 'verifyDummy');

    const responses = [];
    for (let i = 0; i < 10; i += 1) {
      responses.push(await post('login', { correo: user.correo, password: user.password }));
      responses.push(await post('login', { correo: fantasma, password: user.password }));
    }
    for (const r of responses) {
      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({ type: 'urn:omr-preicfes:problema:desafio-requerido' });
    }
    expect(responses[0]?.text).toBe(responses[1]?.text);
    expect(verify).not.toHaveBeenCalled();
    expect(dummy).not.toHaveBeenCalled();
  });

  it('(c) los inicios de sesión correctos no consumen el contador por cuenta ni la reserva de IP', async () => {
    const user = await docente();
    for (let i = 0; i < 10; i += 1) await post('login', { correo: user.correo, password: user.password }).expect(200);
    expect(await counter(h, 'rl:login-challenge:cuenta:*')).toBe(0);
    expect(await counter(h, 'rl:login-failure:ip:*')).toBe(0);
    const doc = await h.usuarios.findById(user.id).lean().orFail();
    expect(doc.estado).toBe(AccountStatus.ACTIVA);
    expect(doc.version_credenciales).toBe(0);
  });

  it('(d) 20 fallos de login simultáneos contra una cuenta → todos 401 (nunca 429) y contadores exactos sin pérdidas', async () => {
    const user = await docente();
    const responses = await Promise.all(Array.from({ length: 20 }, () => post('login', { correo: user.correo, password: WRONG })));
    expect(responses.map((r) => r.status)).toEqual(Array.from({ length: 20 }, () => 401));
    const failures = await counter(h, 'rl:login-challenge:cuenta:*');
    const challenged = await counter(h, 'rl:login-challenge:ip:*');
    // Cada intento es un fallo de contraseña (cuenta +1, reserva de IP retenida) o un desafío (+1 en la IP).
    expect(failures + challenged).toBe(20);
    expect(await counter(h, 'rl:login-failure:ip:*')).toBe(failures);
    expect(failures).toBeGreaterThanOrEqual(h.config.rateLimits.LOGIN_CHALLENGE_ACCOUNT.max);
  }, 60_000);

  it('(j) proveedor de CAPTCHA caído → 503 sin Argon2id ni cambios en contadores; al vencer la ventana por cuenta, el login vuelve a funcionar sin CAPTCHA', async () => {
    const user = await docente();
    const { max, windowMs } = h.config.rateLimits.LOGIN_CHALLENGE_ACCOUNT;
    await fail(user.correo, max);
    const before = {
      cuenta: await counter(h, 'rl:login-challenge:cuenta:*'),
      fallo: await counter(h, 'rl:login-failure:ip:*'),
      desafio: await counter(h, 'rl:login-challenge:ip:*'),
    };
    const verify = jest.spyOn(h.app.get(PasswordHasher), 'verify');
    for (const mode of ['error', 'respuesta-invalida'] as const) {
      h.captcha.mode = mode;
      const res = await post('login', { correo: user.correo, password: user.password, captchaToken: TestCaptchaVerifier.VALID_TOKEN }).expect(503);
      expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:verificacion-no-disponible' });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    }
    h.captcha.mode = 'disponible';
    expect(verify).not.toHaveBeenCalled();
    expect({
      cuenta: await counter(h, 'rl:login-challenge:cuenta:*'),
      fallo: await counter(h, 'rl:login-failure:ip:*'),
      desafio: await counter(h, 'rl:login-challenge:ip:*'),
    }).toEqual(before);

    // La clave expira sola: su TTL está dentro de la ventana; se adelanta el vencimiento.
    for (const key of await h.redisKeys('rl:login-challenge:cuenta:*')) {
      const ttl = await h.redis.pttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(windowMs);
    }
    await expireNow(h, 'rl:login-challenge:cuenta:*');
    await post('login', { correo: user.correo, password: user.password }).expect(200);
  });

  it('(i) con SESSION_MAX_ROTATIONS bajo, la rotación que lo superaría → 401 y LIMITE_ROTACIONES, sin eliminar hashes ni guardar tokens originales', async () => {
    const user = await docente();
    const first = await h.login(user);
    const cookies = [first.cookie];
    for (let i = 0; i < h.config.sessionMaxRotations; i += 1) {
      const res = await h.http().post('/api/v1/auth/refresh').set('Origin', ORIGIN).set('Cookie', cookies.at(-1) ?? '').expect(200);
      cookies.push(refreshCookieFrom(res.headers['set-cookie']).cookie);
    }
    await h.http().post('/api/v1/auth/refresh').set('Origin', ORIGIN).set('Cookie', cookies.at(-1) ?? '').expect(401);
    const sesion = await h.connection.db!.collection('sesiones').findOne({ usuario_id: user.id });
    expect(sesion?.motivo_revocacion).toBe('LIMITE_ROTACIONES');
    expect(sesion?.refresh_hashes_previos).toHaveLength(h.config.sessionMaxRotations);
    const dump = JSON.stringify(await h.connection.db!.collection('sesiones').find().toArray());
    for (const cookie of cookies) expect(dump).not.toContain(cookie.split('=')[1]);
    for (const key of await h.redisKeys()) for (const cookie of cookies) expect(key).not.toContain(cookie.split('=')[1]);
  });

  it('CA-15: JWT válido a los 15 min − 1 s y 401 a los 15 min + 1 s; la sesión renueva a los 7 días − 1 s y vence a los 7 días + 1 s', async () => {
    const user = await docente();
    const session = await h.login(user);
    const me = (token: string) => h.http().get('/api/v1/auth/me').set('Authorization', bearer(token));
    h.clock.advance(h.config.ttl.jwtAccessMs - SECOND);
    await me(session.accessToken).expect(200);
    h.clock.advance(2 * SECOND);
    await me(session.accessToken).expect(401);

    h.clock.advance(h.config.ttl.sessionRefreshMs - h.config.ttl.jwtAccessMs - 2 * SECOND);
    const renewed = await h.http().post('/api/v1/auth/refresh').set('Origin', ORIGIN).set('Cookie', session.cookie).expect(200);
    const cookie = refreshCookieFrom(renewed.headers['set-cookie']).cookie;
    h.clock.advance(2 * SECOND);
    await h.http().post('/api/v1/auth/refresh').set('Origin', ORIGIN).set('Cookie', cookie).expect(401);
  });
});

describe('T-40: vencimiento de enlaces y cambios de estado (reloj controlado)', () => {
  let h: HttpHarness;
  let tokens: SecurityTokensService;
  const { post, docente } = harnessHelpers(() => h);

  beforeAll(async () => {
    // Tiempo máximo de Redis amplio: aquí se prueba el conteo atómico, no el fallo cerrado por demora
    // (cubierto en rate-limits.e2e). Con 500 ms, una ráfaga de 50 en un equipo cargado daba 503.
    h = await bootHttpApp('e2e_t40_b', { env: { RATE_LIMIT_REDIS_TIMEOUT_MS: '5000' } });
    tokens = h.app.get(SecurityTokensService);
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
  });

  it('CA-04: verificación válida a las 24 h − 1 s; vencida a las 24 h + 1 s', async () => {
    const a = await docente(AccountStatus.PENDIENTE_VERIFICACION);
    const b = await docente(AccountStatus.PENDIENTE_VERIFICACION);
    const ta = await tokens.issue(a.id, TokenPurpose.VERIFICAR_CORREO);
    const tb = await tokens.issue(b.id, TokenPurpose.VERIFICAR_CORREO);
    h.clock.advance(h.config.ttl.verifyTokenMs - SECOND);
    await post('verify-email', { token: ta.token }).expect(200);
    h.clock.advance(2 * SECOND);
    await post('verify-email', { token: tb.token }).expect(400);
  });

  it('CA-08/CA-09: restablecimiento válido a los 30 min − 1 s; vencido a los 30 min + 1 s', async () => {
    const a = await docente();
    const b = await docente();
    const ta = await tokens.issue(a.id, TokenPurpose.RESTABLECER_PASSWORD);
    const tb = await tokens.issue(b.id, TokenPurpose.RESTABLECER_PASSWORD);
    h.clock.advance(h.config.ttl.resetTokenMs - SECOND);
    await post('password/reset', { token: ta.token, password: NEW_PASSWORD }).expect(204);
    h.clock.advance(2 * SECOND);
    await post('password/reset', { token: tb.token, password: NEW_PASSWORD }).expect(400);
  });

  it('CA-13: activación vencida a las 24 h + 1 s y válida a las 24 h − 1 s', async () => {
    const admin = await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION, rol: Role.ADMIN });
    await h.usuarios.collection.updateOne({ _id: admin.id }, { $set: { origen: AccountOrigin.BOOTSTRAP } });
    const vencido = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    h.clock.advance(h.config.ttl.activationTokenMs + SECOND);
    await post('activate', { token: vencido.token, password: NEW_PASSWORD }).expect(400);
    const vigente = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    h.clock.advance(h.config.ttl.activationTokenMs - SECOND);
    await post('activate', { token: vigente.token, password: NEW_PASSWORD }).expect(204);
  });

  it('RN-06/RN-19: la cuenta cambia de estado después de emitir el enlace → verificación y restablecimiento → 400, sin cambios', async () => {
    const pendiente = await docente(AccountStatus.PENDIENTE_VERIFICACION);
    const verificacion = await tokens.issue(pendiente.id, TokenPurpose.VERIFICAR_CORREO);
    await h.usuarios.updateOne({ _id: pendiente.id }, { $set: { estado: AccountStatus.DESACTIVADA } });
    await post('verify-email', { token: verificacion.token }).expect(400);
    expect((await h.usuarios.findById(pendiente.id).lean().orFail()).estado).toBe(AccountStatus.DESACTIVADA);

    const activa = await docente();
    const reset = await tokens.issue(activa.id, TokenPurpose.RESTABLECER_PASSWORD);
    await h.usuarios.updateOne({ _id: activa.id }, { $set: { estado: AccountStatus.DESACTIVADA } });
    await post('password/reset', { token: reset.token, password: NEW_PASSWORD }).expect(400);
    const after = await h.usuarios.findById(activa.id).lean().orFail();
    expect(after).toMatchObject({ estado: AccountStatus.DESACTIVADA, version_credenciales: 0 });
  });

  it('CA-10/RN-06: emitir un token nuevo invalida los anteriores del mismo propósito y no los de otro propósito', async () => {
    const user = await docente();
    const r1 = await tokens.issue(user.id, TokenPurpose.RESTABLECER_PASSWORD);
    const r2 = await tokens.issue(user.id, TokenPurpose.RESTABLECER_PASSWORD);
    const r3 = await tokens.issue(user.id, TokenPurpose.RESTABLECER_PASSWORD);
    const v1 = await tokens.issue(user.id, TokenPurpose.VERIFICAR_CORREO);
    for (const old of [r1, r2]) await post('password/reset', { token: old.token, password: NEW_PASSWORD }).expect(400);
    await post('password/reset', { token: r3.token, password: NEW_PASSWORD }).expect(204);
    const stored = await h.connection.db!.collection('tokens_seguridad').findOne({ _id: v1.tokenId });
    expect(stored).toMatchObject({ usado_en: null, invalidado_en: null });
  });

  it('CA-14/RN-09: 50 solicitudes simultáneas desde una IP → pasan exactamente las del máximo y el contador termina en 50', async () => {
    const { max } = h.config.rateLimits.FORGOT_IP;
    const correos = Array.from({ length: 50 }, (_, i) => `concurrente.${i}@example.test`);
    const responses = await Promise.all(correos.map((correo) => post('password/forgot', { correo })));
    const byStatus: Record<number, number> = {};
    for (const r of responses) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    expect(byStatus).toEqual({ 202: max, 429: 50 - max });
    const limited = responses.filter((r) => r.status === 429);
    expect(limited).toHaveLength(50 - max);
    for (const r of limited) {
      const retryAfter = Number(r.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(Math.ceil(h.config.rateLimits.FORGOT_IP.windowMs / 1000));
    }
    expect(await counter(h, 'rl:forgot:ip:*')).toBe(50);
  }, 60_000);
});

describe('T-40 (d): límites de login por IP (umbrales pequeños de la configuración)', () => {
  let h: HttpHarness;
  const { post, docente, ghost } = harnessHelpers(() => h);

  beforeAll(async () => {
    h = await bootHttpApp('e2e_t40_d', {
      env: {
        RATE_LIMIT_LOGIN_IP_FAILURE: '6/15m',
        RATE_LIMIT_LOGIN_CHALLENGE_IP: '4/15m',
        RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT: '3/15m',
      },
    });
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
  });

  it('el intento siguiente al máximo de credenciales incorrectas de una IP → 429 por LOGIN_IP_FAILURE con Retry-After', async () => {
    const { max, windowMs } = h.config.rateLimits.LOGIN_IP_FAILURE;
    for (let i = 0; i < max; i += 1) await post('login', { correo: ghost(), password: WRONG }).expect(401);
    const res = await post('login', { correo: ghost(), password: WRONG }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(Math.ceil(windowMs / 1000));
    expect(await counter(h, 'rl:login-failure:ip:*')).toBe(max);
  });

  it('el intento siguiente al máximo con CAPTCHA ausente o inválido → 429 por LOGIN_CHALLENGE_IP sin consumir LOGIN_IP_FAILURE', async () => {
    const user = await docente();
    const accountMax = h.config.rateLimits.LOGIN_CHALLENGE_ACCOUNT.max;
    for (let i = 0; i < accountMax; i += 1) await post('login', { correo: user.correo, password: WRONG }).expect(401);
    const failuresBefore = await counter(h, 'rl:login-failure:ip:*');
    const { max } = h.config.rateLimits.LOGIN_CHALLENGE_IP;
    for (let i = 0; i < max; i += 1) {
      const body = i % 2 ? { correo: user.correo, password: user.password, captchaToken: 'invalido' } : { correo: user.correo, password: user.password };
      const res = await post('login', body).expect(401);
      expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:desafio-requerido' });
    }
    await post('login', { correo: user.correo, password: user.password }).expect(429);
    expect(await counter(h, 'rl:login-failure:ip:*')).toBe(failuresBefore);
    expect(await counter(h, 'rl:login-challenge:ip:*')).toBe(max);
  });
});
