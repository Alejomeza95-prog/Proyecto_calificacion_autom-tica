import { API_PREFIX } from '../app.setup';
import { singleHeader, type CookieOptions, type HttpRequest } from '../common/http/http-types';

/** Cookie del token de renovación (DEC-01, plan §11). */
export const REFRESH_COOKIE = 'omr_refresh';
export const REFRESH_COOKIE_PATH = `/${API_PREFIX}/auth`;

/** Formato del token de renovación: 32 bytes en base64url (43 caracteres). */
const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, igual en todos los entornos: el plan exige
 * `Secure` siempre (en local, `localhost` es un contexto seguro para el navegador, plan §11).
 */
export function refreshCookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    ...(expires ? { expires } : {}),
  };
}

/**
 * Lee la cookie de renovación de la cabecera `Cookie` sin depender de `cookie-parser`. Si aparece más
 * de una vez o no tiene el formato del token, se trata como ausente.
 */
export function readRefreshCookie(request: HttpRequest): string | undefined {
  const header = singleHeader(request.headers.cookie);
  if (!header) return undefined;
  const values: string[] = [];
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === REFRESH_COOKIE) values.push(part.slice(eq + 1).trim());
  }
  if (values.length !== 1) return undefined;
  const value = values[0];
  return value !== undefined && REFRESH_TOKEN_PATTERN.test(value) ? value : undefined;
}
