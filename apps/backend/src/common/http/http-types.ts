/**
 * Tipos mínimos de la solicitud y la respuesta HTTP (Express) que usa la capa HTTP de autenticación.
 * Se declaran aquí para no depender de los tipos de Express, que no son dependencia directa del backend.
 */
export type HeaderValue = string | string[] | undefined;

export interface HttpRequest {
  readonly method: string;
  readonly headers: Readonly<Record<string, HeaderValue>>;
  /** IP del cliente según `trust proxy` (= `TRUST_PROXY_HOPS`), nunca de una cabecera sin configurar. */
  readonly ip?: string;
}

export interface CookieOptions {
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'strict';
  readonly path: string;
  readonly expires?: Date;
}

export interface HttpResponse {
  status(code: number): HttpResponse;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
}

/** Primer valor de una cabecera; `undefined` si falta o viene repetida con valores distintos. */
export function singleHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}
