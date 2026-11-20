import { ApiError, isApiError, problemFromResponse } from './problem.ts';

/** Ruta relativa: mismo origen (DEC-01). El proxy no reescribe rutas, para conservar el `Path` de la cookie. */
const AUTH_BASE_PATH = '/api/v1/auth';
/** Resto de la API (HT-AUTH-03): mismas reglas de origen, cabeceras y errores que `/auth`. */
export const API_BASE_PATH = '/api/v1';

export interface RequestOptions {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: object;
  readonly bearer?: string;
}

/** Fuente del token de acceso. La implementa el controlador de sesión; el token no sale de ahí (RN-02). */
export interface AccessTokenSource {
  current(): string | null;
  renew(): Promise<string>;
}

/** Solo `Content-Type` y `Authorization`: el CORS del backend no admite cabeceras propias (RN-13). */
function buildHeaders(options: RequestOptions): Record<string, string> {
  return {
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(options.bearer === undefined ? {} : { Authorization: `Bearer ${options.bearer}` }),
  };
}

async function exchange(
  path: string,
  options: RequestOptions,
  basePath: string,
): Promise<{ response: Response; text: string }> {
  try {
    const response = await fetch(`${basePath}${path}`, {
      method: options.method,
      credentials: 'same-origin',
      headers: buildHeaders(options),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    // Un error HTTP aún tiene cuerpo por interpretar: lo lee `problemFromResponse`.
    return { response, text: response.ok ? await response.text() : '' };
  } catch {
    throw new ApiError('red');
  }
}

/** Envía la solicitud. Devuelve el JSON de la respuesta, sin validar, o `undefined` si no hay cuerpo. */
export async function send(path: string, options: RequestOptions, basePath: string = AUTH_BASE_PATH): Promise<unknown> {
  const { response, text } = await exchange(path, options, basePath);
  if (!response.ok) throw await problemFromResponse(response);
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('desconocido', { status: response.status });
  }
}

/**
 * Solicitud con `Bearer` (`/me` y `/logout`). Ante 401 `no-autenticado`, renueva y reintenta una sola vez
 * (plan §2.4); otros errores, como 403 `acceso-denegado`, no se reintentan.
 */
export async function sendProtected(
  path: string,
  options: Omit<RequestOptions, 'bearer'>,
  tokens: AccessTokenSource,
  basePath: string = AUTH_BASE_PATH,
): Promise<unknown> {
  const bearer = tokens.current() ?? (await tokens.renew());
  try {
    return await send(path, { ...options, bearer }, basePath);
  } catch (error) {
    if (!isApiError(error, 'no-autenticado')) throw error;
  }
  return send(path, { ...options, bearer: await tokens.renew() }, basePath);
}

/** Cadena de consulta sin valores vacíos: `{ a: 1, b: undefined }` → `?a=1`. */
export function queryString(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}
