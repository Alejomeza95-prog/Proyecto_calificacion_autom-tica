import { vi } from 'vitest';

/** Solo para pruebas: sustituye `fetch` por respuestas con el formato real del backend. */

export interface RecordedCall {
  readonly route: string;
  readonly url: string;
  readonly credentials: RequestCredentials | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string | undefined;
}

type Handler = () => Response | Promise<Response>;
/** Una lista se consume en orden, y su último elemento se repite. */
type Handlers = Readonly<Record<string, Handler | readonly Handler[]>>;

export const json = (status: number, data: unknown): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const noContent = (): Response => new Response(null, { status: 204 });

export const problem = (
  status: number,
  kind: string,
  extra: { readonly title?: string; readonly errores?: unknown; readonly retryAfter?: string } = {},
): Response =>
  new Response(
    JSON.stringify({
      type: `urn:omr-preicfes:problema:${kind}`,
      title: extra.title ?? 'Título genérico',
      status,
      ...(extra.errores === undefined ? {} : { errores: extra.errores }),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json; charset=utf-8',
        ...(extra.retryAfter === undefined ? {} : { 'Retry-After': extra.retryAfter }),
      },
    },
  );

export const granted = (accessToken: string): Response => json(200, { accessToken, expiresIn: 900 });

export const USER = {
  id: '65f000000000000000000001',
  nombre: 'Persona de prueba',
  rol: 'DOCENTE',
  institucionId: '65f000000000000000000002',
  estado: 'ACTIVA',
} as const;

export const meOk = (): Response => json(200, USER);

const AUTH_PREFIX = '/api/v1/auth';

/** Instala el `fetch` falso. Una ruta sin respuesta definida falla como un error de red. */
export function installFakeAuthApi(handlers: Handlers) {
  const calls: RecordedCall[] = [];
  const positions = new Map<string, number>();

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const route = `${init.method ?? 'GET'} ${url.replace(AUTH_PREFIX, '')}`;
    calls.push({
      route,
      url,
      credentials: init.credentials,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      rawBody: typeof init.body === 'string' ? init.body : undefined,
    });

    const handler = handlers[route];
    if (handler === undefined) throw new TypeError('Failed to fetch');
    if (typeof handler === 'function') return handler();

    const position = positions.get(route) ?? 0;
    positions.set(route, position + 1);
    const next = handler[Math.min(position, handler.length - 1)];
    if (next === undefined) throw new TypeError('Failed to fetch');
    return next();
  });

  vi.stubGlobal('fetch', fetchStub);

  return {
    calls,
    routes: () => calls.map((call) => call.route),
    count: (route: string) => calls.filter((call) => call.route === route).length,
  };
}

/** Promesa que se resuelve desde la prueba, para controlar el orden de las respuestas. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Deja correr las promesas pendientes. */
export const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0));
