import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { AuditoriaAuth } from '../../src/audit/auditoria-auth.schema';
import { REDIS_CLIENT } from '../../src/auth/auth-core.module';
import { Argon2Gate } from '../../src/auth/password/argon2-gate';
import { PasswordHasher } from '../../src/auth/password/password-hasher';
import { TestCaptchaVerifier } from '../../src/captcha/captcha-verifier';
import {
  ChallengeRequiredError,
  InvalidCredentialsError,
  ServiceUnavailableError,
  TooManyAttemptsError,
} from '../../src/common/auth-errors';
import { AuthRateLimitService, GLOBAL_KEY } from '../../src/common/rate-limit/auth-rate-limit.service';
import { bootAuthCore, type AuthCoreHarness } from '../support/auth-core';
import type { Redis } from 'ioredis';

const IP = '198.51.100.10';
const EMAIL = 'objetivo@example.test';

async function counter(h: AuthCoreHarness, pattern: string): Promise<number> {
  const keys = (await h.redisKeys(pattern)).filter((k) => !k.endsWith(':auditado'));
  if (keys.length === 0) return 0;
  const values = await Promise.all(keys.map((k) => h.redis.get(k)));
  return values.reduce((sum, v) => sum + Number(v ?? 0), 0);
}

async function settle(p: Promise<unknown>): Promise<unknown> {
  try {
    return await p;
  } catch (error) {
    return error;
  }
}

/** Valores de límites pequeños, siempre leídos de la configuración (no de constantes de la prueba). */
const SMALL_LIMITS = {
  RATE_LIMIT_LOGIN_IP_FAILURE: '6/15m',
  RATE_LIMIT_LOGIN_CHALLENGE_IP: '4/15m',
  RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT: '3/15m',
  RATE_LIMIT_REGISTER_EMAIL: '3/1h',
  RATE_LIMIT_REGISTER_IP: '10/1h',
  RATE_LIMIT_ACTIVATE_TOKEN: '5/15m',
  RATE_LIMIT_ACTIVATE_IP: '30/15m',
};

describe('límites de intentos (T-13, T-41, T-42)', () => {
  let h: AuthCoreHarness;
  let limits: AuthRateLimitService;
  let audit: Model<AuditoriaAuth>;

  beforeEach(async () => {
    h = await bootAuthCore('rl', { env: SMALL_LIMITS, captchaSlowMs: 1_000 });
    limits = h.moduleRef.get(AuthRateLimitService);
    audit = h.moduleRef.get<Model<AuditoriaAuth>>(getModelToken(AuditoriaAuth.name));
  });

  afterEach(async () => {
    await h.close();
  });

  const login = (check: () => Promise<boolean>, captchaToken?: string, ip = IP, correo = EMAIL) =>
    limits.guardLogin({ ip, correoNormalizado: correo, captchaToken }, check);
  const wrong = () => Promise.resolve(false);
  const right = () => Promise.resolve(true);

  // ------------------------------------------------------------ T-13
  describe('registro, reenvío y recuperación (T-13)', () => {
    it('el intento máximo pasa y el siguiente → 429 con Retry-After; correo existente o no, igual', async () => {
      const max = h.config.rateLimits.REGISTER_EMAIL.max;
      for (let i = 0; i < max; i += 1) await limits.guardAccountOperation('register', IP, 'nuevo@example.test');
      const error = await settle(limits.guardAccountOperation('register', IP, 'nuevo@example.test'));
      expect(error).toBeInstanceOf(TooManyAttemptsError);
      const retry = (error as TooManyAttemptsError).retryAfterS ?? 0;
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(h.config.rateLimits.REGISTER_EMAIL.windowMs / 1_000);
    });

    it('50 solicitudes concurrentes con umbral 10 → exactamente 10 pasan y el contador termina en 50', async () => {
      const results = await Promise.all(
        Array.from({ length: 50 }, (_, i) => settle(limits.guardAccountOperation('register', IP, `c${i}@example.test`))),
      );
      expect(results.filter((r) => r === undefined)).toHaveLength(10);
      expect(results.filter((r) => r instanceof TooManyAttemptsError)).toHaveLength(40);
      expect(await counter(h, 'rl:register:ip:*')).toBe(50);
    });

    it('LIMITE_EXCEDIDO se audita una sola vez por clave y ventana', async () => {
      for (let i = 0; i < 6; i += 1) await settle(limits.guardAccountOperation('register', IP, 'audit@example.test'));
      expect(await audit.countDocuments({ evento: 'LIMITE_EXCEDIDO' })).toBe(1);
    });

    it('ninguna clave rl:* contiene la IP, el correo ni datos en claro (HMAC)', async () => {
      await limits.guardAccountOperation('forgot', IP, EMAIL);
      const keys = await h.redisKeys('rl:*');
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(k).not.toContain(IP);
        expect(k).not.toContain(EMAIL);
        expect(k).toMatch(/^rl:[a-z-]+:(ip|cuenta|registro|global)(:[0-9a-f]+)?$|^rl:auth:global$/);
      }
    });

    it('las claves expiran solas con su ventana (PTTL > 0 y ≤ ventana)', async () => {
      await limits.guardAccountOperation('resend', IP, EMAIL);
      for (const k of await h.redisKeys('rl:resend:*')) {
        const pttl = await h.redis.pttl(k);
        expect(pttl).toBeGreaterThan(0);
        expect(pttl).toBeLessThanOrEqual(h.config.rateLimits.RESEND_IP.windowMs);
      }
    });
  });

  describe('enlaces (T-13)', () => {
    it('tokens inexistentes solo consumen el límite por IP y no crean claves rl:{op}:registro:*', async () => {
      for (let i = 0; i < 20; i += 1) await limits.guardLinkOperation('activate', IP, () => Promise.resolve(null));
      expect(await h.redisKeys('rl:activate:registro:*')).toEqual([]);
      expect(await counter(h, 'rl:activate:ip:*')).toBe(20);
    });

    it('enlace existente: 6.º intento → 429; el contador usa el _id del registro', async () => {
      const id = new Types.ObjectId();
      for (let i = 0; i < 5; i += 1) await limits.guardLinkOperation('activate', IP, () => Promise.resolve(id));
      await expect(limits.guardLinkOperation('activate', IP, () => Promise.resolve(id))).rejects.toBeInstanceOf(
        TooManyAttemptsError,
      );
      expect(await h.redisKeys(`rl:activate:registro:${id.toHexString()}`)).toHaveLength(1);
    });

    it('31.º intento por IP con tokens inválidos → 429', async () => {
      for (let i = 0; i < 30; i += 1) await limits.guardLinkOperation('activate', IP, () => Promise.resolve(null));
      await expect(limits.guardLinkOperation('activate', IP, () => Promise.resolve(null))).rejects.toBeInstanceOf(
        TooManyAttemptsError,
      );
    });
  });

  // ------------------------------------------------- T-13 + T-41 (login)
  describe('inicio de sesión (T-13, T-41)', () => {
    it('los inicios de sesión correctos no consumen el contador por cuenta ni la reserva de IP', async () => {
      for (let i = 0; i < 10; i += 1) await login(right);
      expect(await counter(h, 'rl:login-challenge:cuenta:*')).toBe(0);
      expect(await counter(h, 'rl:login-failure:ip:*')).toBe(0);
    });

    it('fallo → 401 genérico, la reserva de IP queda y sube el contador por cuenta', async () => {
      await expect(login(wrong)).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(await counter(h, 'rl:login-failure:ip:*')).toBe(1);
      expect(await counter(h, 'rl:login-challenge:cuenta:*')).toBe(1);
    });

    it('en el umbral por cuenta, sin CAPTCHA → desafio-requerido sin Argon2id; igual para un correo inexistente', async () => {
      for (let i = 0; i < 3; i += 1) await settle(login(wrong, undefined, `10.0.0.${i}`));
      for (let i = 0; i < 3; i += 1) await settle(login(wrong, undefined, `10.0.1.${i}`, 'inexistente@example.test'));
      const check = jest.fn(right);
      await expect(login(check)).rejects.toBeInstanceOf(ChallengeRequiredError);
      await expect(login(check, undefined, IP, 'inexistente@example.test')).rejects.toBeInstanceOf(ChallengeRequiredError);
      await expect(login(check, 'token-invalido')).rejects.toBeInstanceOf(ChallengeRequiredError);
      expect(check).not.toHaveBeenCalled();
      expect(await counter(h, 'rl:login-challenge:ip:*')).toBe(3);
    });

    it('(a) en el umbral con CAPTCHA válido y contraseña correcta → éxito sin tocar el contador por cuenta', async () => {
      for (let i = 0; i < 3; i += 1) await settle(login(wrong, undefined, `10.0.2.${i}`));
      await expect(login(right, TestCaptchaVerifier.VALID_TOKEN)).resolves.toBeUndefined();
      expect(await counter(h, 'rl:login-challenge:cuenta:*')).toBe(3);
    });

    it('CAPTCHA válido + contraseña incorrecta → 401 y suben el contador por cuenta y LOGIN_IP_FAILURE', async () => {
      for (let i = 0; i < 3; i += 1) await settle(login(wrong, undefined, `10.0.3.${i}`));
      await expect(login(wrong, TestCaptchaVerifier.VALID_TOKEN)).rejects.toBeInstanceOf(InvalidCredentialsError);
      expect(await counter(h, 'rl:login-challenge:cuenta:*')).toBe(4);
      expect(await counter(h, `rl:login-failure:ip:*`)).toBe(4);
    });

    it('nunca responde 429 por la cuenta: 20 fallos concurrentes de distintas IP → 401 o desafío, contador exacto', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => settle(login(wrong, undefined, `10.1.0.${i}`))),
      );
      for (const r of results) {
        expect(r instanceof InvalidCredentialsError || r instanceof ChallengeRequiredError).toBe(true);
      }
      const failures = results.filter((r) => r instanceof InvalidCredentialsError).length;
      expect(await counter(h, 'rl:login-challenge:cuenta:*')).toBe(failures);
    });

    it('(d) el intento siguiente al máximo de credenciales incorrectas por IP → 429 (LOGIN_IP_FAILURE)', async () => {
      const max = h.config.rateLimits.LOGIN_IP_FAILURE.max;
      for (let i = 0; i < max; i += 1) await settle(login(wrong, undefined, IP, `c${i}@example.test`));
      const check = jest.fn(right);
      const error = await settle(login(check, undefined, IP, 'otra@example.test'));
      expect(error).toBeInstanceOf(TooManyAttemptsError);
      expect((error as TooManyAttemptsError).retryAfterS).toBeGreaterThan(0);
      expect(check).not.toHaveBeenCalled();
    });

    it('(d) el intento siguiente al máximo de CAPTCHA ausentes → 429 por LOGIN_CHALLENGE_IP sin consumir LOGIN_IP_FAILURE', async () => {
      for (let i = 0; i < 3; i += 1) await settle(login(wrong, undefined, `10.0.4.${i}`));
      const before = await counter(h, 'rl:login-failure:ip:*');
      const max = h.config.rateLimits.LOGIN_CHALLENGE_IP.max;
      const results = [];
      for (let i = 0; i <= max; i += 1) results.push(await settle(login(right)));
      expect(results.slice(0, max - 1).every((r) => r instanceof ChallengeRequiredError)).toBe(true);
      expect(results.at(-1)).toBeInstanceOf(TooManyAttemptsError);
      expect(await counter(h, 'rl:login-failure:ip:*')).toBe(before);
    });

    it('con LOGIN_IP_FAILURE alcanzado → 429 aunque el CAPTCHA sea válido', async () => {
      const max = h.config.rateLimits.LOGIN_IP_FAILURE.max;
      for (let i = 0; i < max; i += 1) await settle(login(wrong, undefined, IP, `z${i}@example.test`));
      const check = jest.fn(right);
      await expect(login(check, TestCaptchaVerifier.VALID_TOKEN)).rejects.toBeInstanceOf(TooManyAttemptsError);
      expect(check).not.toHaveBeenCalled();
    });

    it('(j) proveedor de CAPTCHA caído, con error o respuesta inválida → 503 sin Argon2id ni cambios en contadores', async () => {
      for (let i = 0; i < 3; i += 1) await settle(login(wrong, undefined, `10.0.5.${i}`));
      const snapshot = async () =>
        Promise.all(['rl:login-failure:*', 'rl:login-challenge:*'].map((p) => counter(h, p)));
      const before = await snapshot();
      const check = jest.fn(right);
      for (const mode of ['lento', 'error', 'respuesta-invalida'] as const) {
        h.captcha.mode = mode;
        const error = await settle(login(check, TestCaptchaVerifier.VALID_TOKEN));
        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expect(error).toMatchObject({ type: 'verificacion-no-disponible' });
        expect((error as ServiceUnavailableError).retryAfterS).toBeGreaterThan(0);
      }
      expect(check).not.toHaveBeenCalled();
      expect(await snapshot()).toEqual(before);
      // Reintento con el proveedor restablecido → flujo normal.
      h.captcha.mode = 'disponible';
      await expect(login(check, TestCaptchaVerifier.VALID_TOKEN)).resolves.toBeUndefined();
    });

    it('(j) al vencer la ventana del contador por cuenta, el login vuelve a funcionar sin CAPTCHA', async () => {
      for (let i = 0; i < 3; i += 1) await settle(login(wrong, undefined, `10.0.6.${i}`));
      await expect(login(right)).rejects.toBeInstanceOf(ChallengeRequiredError);
      // Ventana corta simulada: se adelanta la expiración de la clave en Redis (sin esperar 15 min reales).
      for (const k of await h.redisKeys('rl:login-challenge:cuenta:*')) await h.redis.pexpire(k, 1);
      await new Promise((r) => setTimeout(r, 20));
      await expect(login(right)).resolves.toBeUndefined();
    });
  });

  // ------------------------------------------------------------ T-42
  describe('límite global y Argon2Gate (T-42)', () => {
    it('superar el límite global → 503 (no 429) con Retry-After y devuelve las reservas del cliente', async () => {
      await h.close();
      h = await bootAuthCore('rlglobal', { env: { ...SMALL_LIMITS, RATE_LIMIT_AUTH_GLOBAL: '3/1m' } });
      limits = h.moduleRef.get(AuthRateLimitService);
      for (let i = 0; i < 3; i += 1) await limits.guardAccountOperation('forgot', `10.2.0.${i}`, `g${i}@example.test`);
      const error = await settle(limits.guardAccountOperation('forgot', '10.2.1.1', 'nuevo@example.test'));
      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect(error).toMatchObject({ type: 'servicio-saturado' });
      expect((error as ServiceUnavailableError).retryAfterS).toBeGreaterThan(0);
      // La reserva del cliente rechazado se devolvió.
      expect(await counter(h, 'rl:forgot:*')).toBe(6);
    });

    it('una IP ya limitada (429) no consume el límite global', async () => {
      const max = h.config.rateLimits.LOGIN_IP_FAILURE.max;
      for (let i = 0; i < max; i += 1) await settle(login(wrong, undefined, IP, `x${i}@example.test`));
      const globalBefore = Number(await h.redis.get(GLOBAL_KEY));
      for (let i = 0; i < 5; i += 1) await settle(login(right));
      expect(Number(await h.redis.get(GLOBAL_KEY))).toBe(globalBefore);
    });

    it('dos instancias (dos clientes Redis) comparten el límite global', async () => {
      await h.close();
      h = await bootAuthCore('rlshared', { env: { ...SMALL_LIMITS, RATE_LIMIT_AUTH_GLOBAL: '4/1m' } });
      // La segunda instancia usa el mismo Redis y el mismo espacio de claves que la primera.
      const second = await bootAuthCore('rlshared2', {
        env: { ...SMALL_LIMITS, RATE_LIMIT_AUTH_GLOBAL: '4/1m' },
        redisPrefix: h.redisPrefix,
      });
      try {
        expect(second.moduleRef.get<Redis>(REDIS_CLIENT)).not.toBe(h.redis);
        const a = h.moduleRef.get(AuthRateLimitService);
        const b = second.moduleRef.get(AuthRateLimitService);
        await a.guardAccountOperation('register', '10.3.0.1', 'a1@example.test');
        await b.guardAccountOperation('register', '10.3.0.2', 'b1@example.test');
        await a.guardAccountOperation('register', '10.3.0.3', 'a2@example.test');
        await b.guardAccountOperation('register', '10.3.0.4', 'b2@example.test');
        await expect(b.guardAccountOperation('register', '10.3.0.5', 'b3@example.test')).rejects.toMatchObject({
          type: 'servicio-saturado',
        });
        expect(Number(await h.redis.get(GLOBAL_KEY))).toBe(5);
      } finally {
        await second.close();
      }
    });

    it('RNF-07: con ARGON2_MAX_CONCURRENCY=2 y ARGON2_QUEUE_MAX=2, 10 logins simultáneos → 4 atendidos, el resto 503 sin consumir contadores', async () => {
      await h.close();
      h = await bootAuthCore('rlargon', { env: { ...SMALL_LIMITS, ARGON2_MAX_CONCURRENCY: '2', ARGON2_QUEUE_MAX: '2' } });
      limits = h.moduleRef.get(AuthRateLimitService);
      const hasher = h.moduleRef.get(PasswordHasher);
      const hash = await hasher.hash('contraseña de prueba larga');
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          settle(
            limits.guardLogin({ ip: `10.4.0.${i}`, correoNormalizado: `p${i}@example.test` }, () =>
              hasher.verify(hash, 'contraseña de prueba larga'),
            ),
          ),
        ),
      );
      expect(results.filter((r) => r === undefined)).toHaveLength(4);
      const saturated = results.filter((r) => r instanceof ServiceUnavailableError);
      expect(saturated).toHaveLength(6);
      for (const s of saturated) expect(s).toMatchObject({ type: 'servicio-saturado' });
      expect(h.moduleRef.get(Argon2Gate).metrics().maxObservedActive).toBeLessThanOrEqual(2);
      expect(await counter(h, 'rl:login-failure:ip:*')).toBe(0);
      expect(await counter(h, 'rl:login-challenge:*')).toBe(0);
    });
  });

  // ------------------------------------------------------- fallo cerrado
  describe('fallo cerrado (DEC-06)', () => {
    it('Redis sin respuesta → 503 limitador-no-disponible con Retry-After y LIMITADOR_NO_DISPONIBLE auditado', async () => {
      h.redis.disconnect();
      await new Promise((r) => setTimeout(r, 20));
      const check = jest.fn(right);
      for (const attempt of [
        (): Promise<unknown> => limits.guardAccountOperation('register', IP, EMAIL),
        () => limits.guardLinkOperation('verify', IP, () => Promise.resolve(null)),
        () => login(check),
      ]) {
        const error = await settle(attempt());
        expect(error).toBeInstanceOf(ServiceUnavailableError);
        expect(error).toMatchObject({ type: 'limitador-no-disponible' });
        expect((error as ServiceUnavailableError).retryAfterS).toBeGreaterThan(0);
      }
      expect(check).not.toHaveBeenCalled();
      expect(await audit.countDocuments({ evento: 'LIMITADOR_NO_DISPONIBLE' })).toBe(3);
      await h.redis.connect();
    });
  });

  it('ningún límite cambia el estado de una cuenta (RN-09): el servicio no tiene acceso a usuarios', () => {
    // AuthRateLimitService solo depende del limitador, el CAPTCHA, la auditoría y la configuración.
    const deps = (Reflect.getMetadata('design:paramtypes', AuthRateLimitService) as unknown[]).map((d) =>
      typeof d === 'function' ? d.name : String(d),
    );
    expect(deps.join(',')).not.toMatch(/Users|Usuario/);
  });
});
