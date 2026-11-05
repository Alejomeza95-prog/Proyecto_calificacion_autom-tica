import type { Redis } from 'ioredis';
import type { RateLimitRule } from '../../config/duration';

export class RateLimiterUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Limitador de intentos no disponible', { cause });
    this.name = 'RateLimiterUnavailableError';
  }
}

export interface CounterState {
  readonly count: number;
  /** Milisegundos hasta que expira la clave; `undefined` si Redis no lo informa o no existe. */
  readonly ttlMs: number | undefined;
}

/**
 * Ventana fija atómica: `INCR` y, si la clave es nueva, `PEXPIRE` con la ventana. La clave expira sola
 * al terminar su ventana (DEC-06). Devuelve `{ contador, PTTL }`.
 */
const HIT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}
`;

/** Devuelve una reserva: `DECR` solo si la clave existe y es positiva (no crea claves). */
const RELEASE_SCRIPT = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c > 0 then return redis.call('DECR', KEYS[1]) end
return 0
`;

const PEEK_SCRIPT = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
return {c, redis.call('PTTL', KEYS[1])}
`;

function toCounterState(raw: unknown): CounterState {
  if (!Array.isArray(raw) || raw.length !== 2) throw new RateLimiterUnavailableError('Respuesta inesperada de Redis');
  const [count, pttl] = raw as [unknown, unknown];
  if (typeof count !== 'number' || typeof pttl !== 'number') {
    throw new RateLimiterUnavailableError('Respuesta inesperada de Redis');
  }
  return { count, ttlMs: pttl > 0 ? pttl : undefined };
}

/**
 * Contadores atómicos en Redis con tiempo máximo de respuesta (`RATE_LIMIT_REDIS_TIMEOUT_MS`).
 * Cualquier error o demora se traduce en `RateLimiterUnavailableError` para fallar cerrado (DEC-06).
 * Las claves que recibe ya vienen seudonimizadas: nunca contienen IP, correo, token ni hash del token.
 */
export class RedisRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly timeoutMs: number,
  ) {}

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RateLimiterUnavailableError('Tiempo de espera agotado')), this.timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } catch (error) {
      throw error instanceof RateLimiterUnavailableError ? error : new RateLimiterUnavailableError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cuenta un intento. `exceeded` = el contador superó el máximo con este intento. */
  async hit(key: string, rule: RateLimitRule): Promise<CounterState & { readonly exceeded: boolean }> {
    const state = toCounterState(await this.withTimeout(this.redis.eval(HIT_SCRIPT, 1, key, String(rule.windowMs))));
    return { ...state, exceeded: state.count > rule.max };
  }

  /** Lee el contador sin modificarlo. `reached` = ya alcanzó el máximo (el próximo intento lo superaría). */
  async peek(key: string, rule: RateLimitRule): Promise<CounterState & { readonly reached: boolean }> {
    const state = toCounterState(await this.withTimeout(this.redis.eval(PEEK_SCRIPT, 1, key)));
    return { ...state, reached: state.count >= rule.max };
  }

  /** Devuelve una reserva hecha con `hit` (plan §5: reserva de `LOGIN_IP_FAILURE`, 503). */
  async release(key: string): Promise<void> {
    await this.withTimeout(this.redis.eval(RELEASE_SCRIPT, 1, key));
  }

  /** `true` solo la primera vez por clave y ventana: evita inundar la auditoría con LIMITE_EXCEDIDO. */
  async firstTimeInWindow(markerKey: string, ttlMs: number): Promise<boolean> {
    const result = await this.withTimeout(this.redis.set(markerKey, '1', 'PX', Math.max(1, ttlMs), 'NX'));
    return result === 'OK';
  }
}
