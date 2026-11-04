import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AuditService } from '../../audit/audit.service';
import { CAPTCHA_VERIFIER, type CaptchaVerifier } from '../../captcha/captcha-verifier';
import { AUTH_CONFIG } from '../../config/config.module';
import type { AuthConfig, RateLimitKey } from '../../config/auth-config';
import type { RateLimitRule } from '../../config/duration';
import {
  ChallengeRequiredError,
  InvalidCredentialsError,
  ServiceUnavailableError,
  TooManyAttemptsError,
} from '../auth-errors';
import { RateLimiterUnavailableError, RedisRateLimiter } from './redis-rate-limiter';

export const RATE_LIMITER = Symbol('RATE_LIMITER');

/** Operaciones públicas sensibles con límite por cuenta/correo e IP (spec §6.6). */
export type AccountOperation = 'register' | 'resend' | 'forgot';
/** Operaciones con límite por enlace existente e IP. */
export type LinkOperation = 'verify' | 'reset' | 'activate';

const ACCOUNT_RULES: Readonly<Record<AccountOperation, { account: RateLimitKey; ip: RateLimitKey }>> = {
  register: { account: 'REGISTER_EMAIL', ip: 'REGISTER_IP' },
  resend: { account: 'RESEND_ACCOUNT', ip: 'RESEND_IP' },
  forgot: { account: 'FORGOT_ACCOUNT', ip: 'FORGOT_IP' },
};

const LINK_RULES: Readonly<Record<LinkOperation, { record: RateLimitKey; ip: RateLimitKey }>> = {
  verify: { record: 'VERIFY_TOKEN', ip: 'VERIFY_IP' },
  reset: { record: 'RESET_TOKEN', ip: 'RESET_IP' },
  activate: { record: 'ACTIVATE_TOKEN', ip: 'ACTIVATE_IP' },
};

export const GLOBAL_KEY = 'rl:auth:global';

interface Counter {
  readonly key: string;
  readonly rule: RateLimitRule;
}

export interface LoginAttempt {
  readonly ip: string;
  readonly correoNormalizado: string;
  readonly captchaToken?: string;
}

function retryAfterSeconds(ttlMs: number | undefined): number | undefined {
  return ttlMs === undefined ? undefined : Math.max(1, Math.ceil(ttlMs / 1_000));
}

/**
 * Límites de intentos de las 7 operaciones públicas sensibles (plan §5, §8 y §11; DEC-06, DEC-15,
 * DEC-16 y DEC-17; T-13, T-41 y T-42).
 * - Claves `rl:{op}:{dimensión}:{id}`: IP y correo como HMAC con `RATE_LIMIT_KEY_PEPPER`; enlaces por el
 *   `_id` de un registro **existente**; `rl:auth:global` compartida por todas las instancias.
 * - 429 con `Retry-After` solo por límites atribuibles al cliente; 503 por capacidad o disponibilidad,
 *   devolviendo las reservas del cliente.
 * - Nunca cambia el estado de la cuenta ni `version_credenciales` (sin bloqueo de cuenta, RN-09).
 * - Fallo cerrado: si Redis no responde, 503 `limitador-no-disponible` y evento LIMITADOR_NO_DISPONIBLE.
 */
@Injectable()
export class AuthRateLimitService {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RedisRateLimiter,
    @Inject(CAPTCHA_VERIFIER) private readonly captcha: CaptchaVerifier,
    private readonly audit: AuditService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  // --- claves -------------------------------------------------------------

  private hmac(value: string): string {
    return createHmac('sha256', this.config.rateLimitKeyPepper).update(value).digest('hex');
  }

  private counter(op: string, dimension: 'ip' | 'cuenta', value: string, rule: RateLimitKey): Counter {
    return { key: `rl:${op}:${dimension}:${this.hmac(value)}`, rule: this.config.rateLimits[rule] };
  }

  private recordCounter(op: LinkOperation, recordId: Types.ObjectId): Counter {
    return { key: `rl:${op}:registro:${recordId.toHexString()}`, rule: this.config.rateLimits[LINK_RULES[op].record] };
  }

  private loginCounters(attempt: LoginAttempt) {
    return {
      ipFailure: this.counter('login-failure', 'ip', attempt.ip, 'LOGIN_IP_FAILURE'),
      challengeIp: this.counter('login-challenge', 'ip', attempt.ip, 'LOGIN_CHALLENGE_IP'),
      account: this.counter('login-challenge', 'cuenta', attempt.correoNormalizado, 'LOGIN_CHALLENGE_ACCOUNT'),
    };
  }

  // --- utilidades ---------------------------------------------------------

  /** Ejecuta operaciones del limitador; si Redis falla, audita y responde 503 (DEC-06). */
  private async guarded<T>(ip: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof RateLimiterUnavailableError)) throw error;
      await this.audit.recordSafely({ evento: 'LIMITADOR_NO_DISPONIBLE', resultado: 'RECHAZADO', ip });
      throw new ServiceUnavailableError('limitador-no-disponible', this.config.authOverloadRetryAfterS);
    }
  }

  /** Audita LIMITE_EXCEDIDO una sola vez por clave y ventana y devuelve el 429. */
  private async tooMany(ip: string, exceeded: readonly { key: string; ttlMs: number | undefined }[]): Promise<TooManyAttemptsError> {
    let maxTtl: number | undefined;
    for (const { key, ttlMs } of exceeded) {
      if (ttlMs !== undefined) maxTtl = Math.max(maxTtl ?? 0, ttlMs);
      if (await this.limiter.firstTimeInWindow(`${key}:auditado`, ttlMs ?? 1_000)) {
        await this.audit.recordSafely({ evento: 'LIMITE_EXCEDIDO', resultado: 'RECHAZADO', ip });
      }
    }
    return new TooManyAttemptsError(retryAfterSeconds(maxTtl));
  }

  private async hitAll(ip: string, counters: readonly Counter[]): Promise<void> {
    const results = await Promise.all(counters.map(async (c) => ({ key: c.key, ...(await this.limiter.hit(c.key, c.rule)) })));
    const exceeded = results.filter((r) => r.exceeded);
    if (exceeded.length > 0) throw await this.tooMany(ip, exceeded);
  }

  /**
   * Límite global (DEC-17), evaluado después de los límites del cliente. Superado → 503 con el tiempo
   * restante de la ventana global, devolviendo las reservas del cliente indicadas.
   */
  private async enforceGlobal(clientReservations: readonly string[]): Promise<void> {
    const global = await this.limiter.hit(GLOBAL_KEY, this.config.rateLimits.AUTH_GLOBAL);
    if (!global.exceeded) return;
    for (const key of clientReservations) await this.limiter.release(key);
    throw new ServiceUnavailableError(
      'servicio-saturado',
      retryAfterSeconds(global.ttlMs) ?? this.config.authOverloadRetryAfterS,
    );
  }

  // --- registro, reenvío y recuperación -----------------------------------

  /** Cuenta la solicitud por correo normalizado (exista o no la cuenta, RN-04) y por IP. */
  async guardAccountOperation(op: AccountOperation, ip: string, correoNormalizado: string): Promise<void> {
    await this.guarded(ip, async () => {
      const counters = [
        this.counter(op, 'cuenta', correoNormalizado, ACCOUNT_RULES[op].account),
        this.counter(op, 'ip', ip, ACCOUNT_RULES[op].ip),
      ];
      await this.hitAll(ip, counters);
      await this.enforceGlobal(counters.map((c) => c.key));
    });
  }

  // --- verificación, restablecimiento y activación ------------------------

  /**
   * Límite por enlace (plan §5): 1) IP; 2) `findRecordId` busca el registro sin filtrar por estado;
   * 3) si no existe, solo cuenta la IP y no se crea ninguna clave adicional; 4) si existe, cuenta por
   * su `_id`; 5) límite global. Devuelve el `_id` encontrado (o `null`) para que el llamador responda.
   */
  async guardLinkOperation(
    op: LinkOperation,
    ip: string,
    findRecordId: () => Promise<Types.ObjectId | null>,
  ): Promise<Types.ObjectId | null> {
    return this.guarded(ip, async () => {
      const ipCounter = this.counter(op, 'ip', ip, LINK_RULES[op].ip);
      await this.hitAll(ip, [ipCounter]);
      const recordId = await findRecordId();
      const reservations = [ipCounter.key];
      if (recordId) {
        const recordCounter = this.recordCounter(op, recordId);
        await this.hitAll(ip, [recordCounter]);
        reservations.push(recordCounter.key);
      }
      await this.enforceGlobal(reservations);
      return recordId;
    });
  }

  // --- inicio de sesión ----------------------------------------------------

  /** CAPTCHA con tiempo máximo; sin respuesta, error o respuesta inválida → 503 (plan §11). */
  private async verifyCaptcha(token: string, ip: string): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), this.config.captcha.verifyTimeoutMs);
    });
    try {
      return await Promise.race([this.captcha.verify(token, { action: 'login', remoteIp: ip }), timeout]);
    } catch {
      throw new ServiceUnavailableError('verificacion-no-disponible', this.config.authOverloadRetryAfterS);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Orquesta el login según plan §5 («Inicio de sesión con límites»).
   * `checkCredentials` verifica la contraseña con Argon2id a través de `Argon2Gate` (hash ficticio si la
   * cuenta no existe) y devuelve `true` solo si las credenciales son correctas y la cuenta está ACTIVA.
   * Termina sin error en el éxito; si no, lanza 429, 503, `desafio-requerido` o 401 genérico.
   */
  async guardLogin(attempt: LoginAttempt, checkCredentials: () => Promise<boolean>): Promise<void> {
    const { ip } = attempt;
    const c = this.loginCounters(attempt);

    // 1) Límites atribuibles al cliente, baratos y sin Argon2id.
    await this.guarded(ip, async () => {
      const [ipFailure, challengeIp] = await Promise.all([
        this.limiter.peek(c.ipFailure.key, c.ipFailure.rule),
        this.limiter.peek(c.challengeIp.key, c.challengeIp.rule),
      ]);
      const reached = [
        ...(ipFailure.reached ? [{ key: c.ipFailure.key, ttlMs: ipFailure.ttlMs }] : []),
        ...(challengeIp.reached ? [{ key: c.challengeIp.key, ttlMs: challengeIp.ttlMs }] : []),
      ];
      if (reached.length > 0) throw await this.tooMany(ip, reached);
      // 2) Límite global, solo para solicitudes que pasaron el paso 1.
      await this.enforceGlobal([]);
    });

    // 3) Desafío por cuenta (DEC-16): nunca 429 por la cuenta.
    const account = await this.guarded(ip, () => this.limiter.peek(c.account.key, c.account.rule));
    if (account.reached) {
      const valid = attempt.captchaToken ? await this.verifyCaptcha(attempt.captchaToken, ip) : false;
      if (!valid) {
        await this.guarded(ip, () => this.hitAll(ip, [c.challengeIp]));
        throw new ChallengeRequiredError();
      }
    }

    // 4) Reserva de LOGIN_IP_FAILURE y verificación con Argon2id.
    await this.guarded(ip, async () => {
      const reservation = await this.limiter.hit(c.ipFailure.key, c.ipFailure.rule);
      if (reservation.exceeded) {
        await this.limiter.release(c.ipFailure.key);
        throw await this.tooMany(ip, [{ key: c.ipFailure.key, ttlMs: reservation.ttlMs }]);
      }
    });
    let ok: boolean;
    try {
      ok = await checkCredentials();
    } catch (error) {
      // Argon2Gate saturado u otra falla: la reserva se devuelve (un 503 no consume contadores del cliente).
      await this.guarded(ip, () => this.limiter.release(c.ipFailure.key));
      throw error;
    }

    // 5) Éxito: se devuelve la reserva y el contador por cuenta no se toca.
    if (ok) {
      await this.guarded(ip, () => this.limiter.release(c.ipFailure.key));
      return;
    }

    // 6) Fallo: la reserva queda y sube el contador por cuenta; 401 genérico.
    await this.guarded(ip, () => this.limiter.hit(c.account.key, c.account.rule));
    throw new InvalidCredentialsError();
  }
}
