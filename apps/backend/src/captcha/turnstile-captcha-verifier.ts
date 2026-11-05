import { Logger } from '@nestjs/common';
import type { CaptchaContext, CaptchaVerifier } from './captcha-verifier';

/** Endpoint de Siteverify de Cloudflare Turnstile (DEC-24): fijo, no configurable. */
export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Longitud máxima de un token de Turnstile según el proveedor (DEC-24). */
export const TURNSTILE_MAX_TOKEN_LENGTH = 2048;

/** Códigos que indican un token inválido, vencido o ya usado: resultado negativo, no falla del proveedor. */
const NEGATIVE_CODES: ReadonlySet<string> = new Set(['invalid-input-response', 'timeout-or-duplicate', 'missing-input-response']);

/** Firma mínima de `fetch` que usa el adaptador (inyectable en las pruebas). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface TurnstileOptions {
  readonly secret: string;
  readonly expectedHostnames: readonly string[];
  readonly timeoutMs: number;
}

/**
 * Falla del proveedor o de nuestra configuración: el login responde 503 `verificacion-no-disponible`
 * (fallo cerrado, plan §11). `reason` es un código seguro: nunca contiene el token ni el secreto.
 */
export class CaptchaProviderError extends Error {
  constructor(readonly reason: string) {
    super(`Verificación de CAPTCHA no disponible (${reason})`);
    this.name = 'CaptchaProviderError';
  }
}

interface SiteverifyResponse {
  readonly success: boolean;
  readonly hostname?: string;
  readonly action?: string;
  readonly errorCodes: readonly string[];
}

function parseSiteverify(raw: unknown): SiteverifyResponse | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.success !== 'boolean') return null;
  const codes = body['error-codes'] ?? [];
  if (!Array.isArray(codes) || !codes.every((c) => typeof c === 'string')) return null;
  return {
    success: body.success,
    hostname: typeof body.hostname === 'string' ? body.hostname : undefined,
    action: typeof body.action === 'string' ? body.action : undefined,
    errorCodes: codes,
  };
}

/**
 * Adaptador de Cloudflare Turnstile (modo Managed) para `CaptchaVerifier` (DEC-16, DEC-24, T-41).
 * - Un solo `POST` a Siteverify con `secret` y `response`; **sin** `remoteip` y **sin** reintentos.
 * - Tiempo máximo propio (`AbortSignal.timeout`) además del que aplica `AuthRateLimitService`.
 * - `true` solo si `success` es verdadero, el `hostname` es uno de los permitidos y la acción coincide.
 * - Token inválido, vencido, reutilizado, de otro hostname u otra acción → `false` (desafío no superado).
 * - Error de red, tiempo agotado, HTTP distinto de 2xx, JSON no validable, secreto ausente o inválido y
 *   `internal-error` → `CaptchaProviderError` (503, fallo cerrado).
 * - Nunca registra el token ni el secreto: el log solo lleva el motivo.
 */
export class TurnstileCaptchaVerifier implements CaptchaVerifier {
  private readonly logger = new Logger('TurnstileCaptchaVerifier');
  private readonly hostnames: ReadonlySet<string>;

  constructor(
    private readonly options: TurnstileOptions,
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
  ) {
    this.hostnames = new Set(options.expectedHostnames.map((h) => h.toLowerCase()));
  }

  async verify(token: string, context: CaptchaContext): Promise<boolean> {
    if (token.length === 0 || token.length > TURNSTILE_MAX_TOKEN_LENGTH) return false;
    const body = new URLSearchParams({ secret: this.options.secret, response: token });
    let response: Response;
    try {
      response = await this.fetchFn(TURNSTILE_SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      // Por nombre y no con `instanceof`: la señal rechaza con un `DOMException` (otro reino en Jest).
      const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
      throw this.unavailable(name === 'TimeoutError' || name === 'AbortError' ? 'tiempo-agotado' : 'error-de-red');
    }
    if (!response.ok) throw this.unavailable(`http-${response.status}`);
    let parsed: SiteverifyResponse | null;
    try {
      parsed = parseSiteverify(await response.json());
    } catch {
      parsed = null;
    }
    if (!parsed) throw this.unavailable('respuesta-no-validable');
    if (parsed.success) {
      return parsed.hostname !== undefined && this.hostnames.has(parsed.hostname.toLowerCase()) && parsed.action === context.action;
    }
    if (parsed.errorCodes.length > 0 && parsed.errorCodes.every((c) => NEGATIVE_CODES.has(c))) return false;
    // Secreto ausente o inválido, solicitud mal formada, `internal-error` o códigos desconocidos.
    const codes = parsed.errorCodes.filter((c) => /^[a-z-]{1,40}$/.test(c)).join(',') || 'sin-codigo';
    throw this.unavailable(`codigos:${codes}`);
  }

  private unavailable(reason: string): CaptchaProviderError {
    this.logger.error(`Turnstile no disponible (${reason})`);
    return new CaptchaProviderError(reason);
  }
}
