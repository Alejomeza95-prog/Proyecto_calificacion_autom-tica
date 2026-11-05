import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { Role } from '../src/authz/role';
import type { RateLimitKey } from '../src/config/auth-config';
import { SecurityTokensService } from '../src/security-tokens/security-tokens.service';
import { TokenPurpose } from '../src/security-tokens/token-purpose';
import { AccountStatus } from '../src/users/account-status';
import { AccountOrigin } from '../src/users/usuario.schema';
import { bearer, bootHttpApp, ORIGIN, TEST_PASSWORD, type HttpHarness } from './support/http-app';

const NEW_PASSWORD = 'frase nueva suficientemente larga';

interface AccountOp {
  readonly op: string;
  readonly path: string;
  readonly rule: RateLimitKey;
  readonly body: (correo: string) => Record<string, unknown>;
  readonly seed: AccountStatus;
}

const ACCOUNT_OPS: readonly AccountOp[] = [
  { op: 'register', path: 'register', rule: 'REGISTER_EMAIL', body: (correo) => ({ nombre: 'Ana', correo, password: TEST_PASSWORD }), seed: AccountStatus.ACTIVA },
  { op: 'resend', path: 'resend-verification', rule: 'RESEND_ACCOUNT', body: (correo) => ({ correo }), seed: AccountStatus.PENDIENTE_VERIFICACION },
  { op: 'forgot', path: 'password/forgot', rule: 'FORGOT_ACCOUNT', body: (correo) => ({ correo }), seed: AccountStatus.ACTIVA },
];

interface LinkOp {
  readonly op: string;
  readonly path: string;
  readonly ipRule: RateLimitKey;
  readonly recordRule: RateLimitKey;
  readonly purpose: TokenPurpose;
  readonly body: (token: string) => Record<string, unknown>;
}

const LINK_OPS: readonly LinkOp[] = [
  { op: 'verify', path: 'verify-email', ipRule: 'VERIFY_IP', recordRule: 'VERIFY_TOKEN', purpose: TokenPurpose.VERIFICAR_CORREO, body: (token) => ({ token }) },
  { op: 'reset', path: 'password/reset', ipRule: 'RESET_IP', recordRule: 'RESET_TOKEN', purpose: TokenPurpose.RESTABLECER_PASSWORD, body: (token) => ({ token, password: NEW_PASSWORD }) },
  { op: 'activate', path: 'activate', ipRule: 'ACTIVATE_IP', recordRule: 'ACTIVATE_TOKEN', purpose: TokenPurpose.ACTIVAR_CUENTA, body: (token) => ({ token, password: NEW_PASSWORD }) },
];

/**
 * T-13 por HTTP: CA-14 y RN-09 (plan §12) sobre las 7 operaciones públicas sensibles, con los umbrales
 * leídos de la configuración (DEC-15) y el limitador aplicado en el servicio de cada operación
 * (`AuthRateLimitService`, plan §2.3). El login (LOGIN_IP_FAILURE, LOGIN_CHALLENGE_IP, sin 429 por la
 * cuenta, `X-Forwarded-For`) está en `test/auth-session.e2e-spec.ts` y `test/integration/rate-limit.int-spec.ts`.
 */
describe('límites de intentos de las 7 operaciones (T-13, e2e)', () => {
  let h: HttpHarness;
  let tokens: SecurityTokensService;
  const post = (path: string, body: Record<string, unknown>) =>
    h.http().post(`/api/v1/auth/${path}`).set('Origin', ORIGIN).send(body);
  const institucion = new Types.ObjectId();
  const unique = (prefix: string) => `${prefix}.${randomBytes(3).toString('hex')}@example.test`;
  const audit = () => h.connection.db!.collection('auditoria_auth');

  beforeAll(async () => {
    h = await bootHttpApp('e2e_rate_limits', { env: { RATE_LIMIT_REGISTER_IP: '1000/1h' } });
    tokens = h.app.get(SecurityTokensService);
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    h.mail.clear();
  });

  describe.each(ACCOUNT_OPS)('$op', ({ path, rule, body, seed }) => {
    it('el máximo pasa y el siguiente → 429 con Retry-After en (0, ventana]; idéntico con o sin cuenta', async () => {
      const { max, windowMs } = h.config.rateLimits[rule];
      const existing = await h.createUser({ estado: seed, rol: Role.DOCENTE, institucionId: institucion, correo: unique('existe') });
      const missing = unique('nadie');
      const limited: { text: string; retryAfter: number }[] = [];
      for (const correo of [existing.correo, missing]) {
        for (let i = 0; i < max; i += 1) await post(path, body(correo)).expect(202);
        // El registro del correo «inexistente» lo crea: se elimina antes del intento que excede.
        await h.usuarios.deleteOne({ correo_normalizado: missing });
        const res = await post(path, body(correo)).expect(429);
        expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
        limited.push({ text: res.text, retryAfter: Number(res.headers['retry-after']) });
      }
      expect(limited[0]?.text).toBe(limited[1]?.text);
      for (const { retryAfter } of limited) {
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(Math.ceil(windowMs / 1000));
      }
      expect(await h.usuarios.countDocuments({ correo_normalizado: missing })).toBe(0);
      expect((await h.usuarios.findById(existing.id).lean().orFail()).estado).toBe(seed);
    }, 60_000);
  });

  it('al expirar la clave (vencimiento adelantado con PEXPIRE) se puede reintentar; LIMITE_EXCEDIDO se audita una vez por clave y ventana', async () => {
    const { max, windowMs } = h.config.rateLimits.RESEND_ACCOUNT;
    const correo = unique('expira');
    for (let i = 0; i < max; i += 1) await post('resend-verification', { correo }).expect(202);
    const before = await audit().countDocuments({ evento: 'LIMITE_EXCEDIDO' });
    for (let i = 0; i < 3; i += 1) await post('resend-verification', { correo }).expect(429);
    expect(await audit().countDocuments({ evento: 'LIMITE_EXCEDIDO' })).toBe(before + 1);
    // La clave expira sola: TTL dentro de la ventana. Se adelanta el vencimiento (sin esperar la ventana real).
    const keys = (await h.redisKeys('rl:resend:cuenta:*')).filter((k) => !k.endsWith(':auditado'));
    expect(keys).toHaveLength(1);
    const ttl = await h.redis.pttl(keys[0] ?? '');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(windowMs);
    for (const k of await h.redisKeys('rl:resend:cuenta:*')) await h.redis.pexpire(k, 1);
    for (let i = 0; i < 100 && (await h.redisKeys('rl:resend:cuenta:*')).length > 0; i += 1) {
      await new Promise((r) => setImmediate(r));
    }
    await post('resend-verification', { correo }).expect(202);
  }, 30_000);

  describe.each(LINK_OPS)('$op', ({ op, path, ipRule, recordRule, purpose, body }) => {
    it('tokens inventados solo consumen el límite por IP, sin claves rl:{op}:registro:*; al superarlo → 429', async () => {
      const { max } = h.config.rateLimits[ipRule];
      const invented: string[] = [];
      for (let i = 0; i < max; i += 1) {
        const token = randomBytes(32).toString('base64url');
        invented.push(token);
        await post(path, body(token)).expect(400);
      }
      const res = await post(path, body(randomBytes(32).toString('base64url'))).expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      // Las claves `:auditado` solo marcan que LIMITE_EXCEDIDO ya se auditó en la ventana.
      const keys = await h.redisKeys('rl:*');
      const counters = keys.filter((k) => !k.endsWith(':auditado'));
      expect(counters.filter((k) => k.startsWith(`rl:${op}:registro:`))).toEqual([]);
      expect(counters.filter((k) => k.startsWith(`rl:${op}:ip:`))).toHaveLength(1);
      for (const key of keys) for (const token of invented.slice(0, 3)) expect(key).not.toContain(token);
    }, 60_000);

    it('con un enlace existente, el intento siguiente al máximo por enlace → 429', async () => {
      const { max } = h.config.rateLimits[recordRule];
      const user = await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION, rol: Role.ADMIN, correo: unique(op) });
      if (purpose === TokenPurpose.ACTIVAR_CUENTA) {
        await h.usuarios.deleteMany({ origen: AccountOrigin.BOOTSTRAP });
        await h.usuarios.collection.updateOne({ _id: user.id }, { $set: { origen: AccountOrigin.BOOTSTRAP } });
      }
      if (purpose === TokenPurpose.RESTABLECER_PASSWORD) {
        await h.usuarios.collection.updateOne({ _id: user.id }, { $set: { estado: AccountStatus.ACTIVA } });
      }
      const { token } = await tokens.issue(user.id, purpose);
      const statuses: number[] = [];
      for (let i = 0; i < max; i += 1) statuses.push((await post(path, body(token))).status);
      expect(statuses[0]).toBeLessThan(300);
      expect(statuses.slice(1).every((s) => s === 400)).toBe(true);
      await post(path, body(token)).expect(429);
      const keys = (await h.redisKeys(`rl:${op}:registro:*`)).filter((k) => !k.endsWith(':auditado'));
      expect(keys).toHaveLength(1);
      expect(keys[0]).not.toContain(token);
    }, 60_000);
  });

  it('RN-09/DEC-06: con Redis caído las 7 operaciones → 503 limitador-no-disponible con Retry-After, sin efectos; /me sigue respondiendo', async () => {
    const user = await h.createUser({ rol: Role.DOCENTE, institucionId: institucion, correo: unique('caida') });
    const { accessToken } = await h.login(user);
    const pending = await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION, correo: unique('pendiente') });
    const issued = await tokens.issue(pending.id, TokenPurpose.VERIFICAR_CORREO);
    const before = await audit().countDocuments({ evento: 'LIMITADOR_NO_DISPONIBLE' });
    const requests: [string, Record<string, unknown>][] = [
      ['register', { nombre: 'Ana', correo: unique('caida.registro'), password: TEST_PASSWORD }],
      ['login', { correo: user.correo, password: user.password }],
      ['verify-email', { token: issued.token }],
      ['resend-verification', { correo: pending.correo }],
      ['password/forgot', { correo: user.correo }],
      ['password/reset', { token: randomBytes(32).toString('base64url'), password: NEW_PASSWORD }],
      ['activate', { token: randomBytes(32).toString('base64url'), password: NEW_PASSWORD }],
    ];
    h.redis.disconnect();
    try {
      for (const [path, body] of requests) {
        const res = await post(path, body);
        expect({ path, status: res.status }).toEqual({ path, status: 503 });
        expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:limitador-no-disponible' });
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      }
      await h.http().get('/api/v1/auth/me').set('Authorization', bearer(accessToken)).expect(200);
    } finally {
      await h.redis.connect();
    }
    expect(await audit().countDocuments({ evento: 'LIMITADOR_NO_DISPONIBLE' })).toBeGreaterThanOrEqual(before + requests.length);
    // Sin efectos: ninguna cuenta creada ni verificada, ningún token consumido.
    expect(await h.usuarios.countDocuments({ correo_normalizado: /caida\.registro/ })).toBe(0);
    expect((await h.usuarios.findById(pending.id).lean().orFail()).estado).toBe(AccountStatus.PENDIENTE_VERIFICACION);
    await post('verify-email', { token: issued.token }).expect(200);
  }, 60_000);

  it('RN-09/RN-12: ninguna clave rl:* ni la auditoría contienen el correo, la IP ni tokens; ningún límite bloquea la cuenta', async () => {
    const user = await h.createUser({ rol: Role.DOCENTE, institucionId: institucion, correo: unique('privado') });
    const { max } = h.config.rateLimits.FORGOT_ACCOUNT;
    for (let i = 0; i <= max; i += 1) await post('password/forgot', { correo: user.correo });
    for (const key of await h.redisKeys('rl:*')) {
      expect(key).not.toMatch(/@|example|127\.0\.0\.1|::1/);
    }
    const dump = JSON.stringify(await audit().find({}).toArray());
    expect(dump).not.toContain(user.correo);
    expect(dump).not.toMatch(/"ip":|127\.0\.0\.1/);
    const after = await h.usuarios.findById(user.id).lean().orFail();
    expect(after.estado).toBe(AccountStatus.ACTIVA);
    expect(after.version_credenciales).toBe(0);
  }, 60_000);
});
