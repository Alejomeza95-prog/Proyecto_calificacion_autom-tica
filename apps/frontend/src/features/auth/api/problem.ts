const PROBLEM_TYPE_PREFIX = 'urn:omr-preicfes:problema:';
const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** Tipos de `apps/backend/src/common/http/problem.ts`. */
const PROBLEM_KINDS = [
  'solicitud-invalida',
  'no-autenticado',
  'credenciales-invalidas',
  'desafio-requerido',
  'acceso-denegado',
  'origen-no-permitido',
  'no-encontrado',
  'enlace-invalido',
  'politica-password',
  'demasiados-intentos',
  'limitador-no-disponible',
  'servicio-saturado',
  'verificacion-no-disponible',
  'error-interno',
] as const;

export type ProblemKind = (typeof PROBLEM_KINDS)[number];

/** `desconocido`: respuesta fuera del contrato. `red`: la solicitud no obtuvo respuesta. */
export type ApiErrorKind = ProblemKind | 'desconocido' | 'red';

interface ApiErrorDetails {
  readonly status?: number;
  readonly title?: string;
  readonly fields?: readonly string[];
  readonly retryAfterSeconds?: number;
}

/**
 * Error tipado de la API (plan §9.1). No conserva cuerpos ni valores enviados (RN-11): de `errores[]`
 * solo guarda el nombre del campo, porque `reglas` son nombres internos del validador.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Título genérico del backend; solo presente con un tipo conocido. */
  readonly title: string | null;
  readonly fields: readonly string[];
  readonly retryAfterSeconds: number | null;

  constructor(kind: ApiErrorKind, details: ApiErrorDetails = {}) {
    super(`Solicitud de autenticación fallida: ${kind}`);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = details.status ?? null;
    this.title = details.title ?? null;
    this.fields = details.fields ?? [];
    this.retryAfterSeconds = details.retryAfterSeconds ?? null;
  }
}

export function isApiError(error: unknown, kind?: ApiErrorKind): error is ApiError {
  return error instanceof ApiError && (kind === undefined || error.kind === kind);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Segundos positivos de `Retry-After`; cualquier otro valor equivale a no conocer la espera. */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value.trim());
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function toProblemKind(type: unknown): ProblemKind | null {
  if (typeof type !== 'string' || !type.startsWith(PROBLEM_TYPE_PREFIX)) return null;
  const candidate = type.slice(PROBLEM_TYPE_PREFIX.length);
  return PROBLEM_KINDS.find((kind) => kind === candidate) ?? null;
}

function toFieldNames(errores: unknown): string[] {
  if (!Array.isArray(errores)) return [];
  return errores.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.campo === 'string' ? [entry.campo] : [],
  );
}

async function readProblemBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes(PROBLEM_CONTENT_TYPE)) return null;
  try {
    return await response.json();
  } catch {
    // Un cuerpo ilegible queda como `desconocido`: su contenido no se conserva.
    return null;
  }
}

/** Convierte una respuesta no satisfactoria en `ApiError`, conservando estado y `Retry-After`. */
export async function problemFromResponse(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
  const base = { status: response.status, ...(retryAfterSeconds === null ? {} : { retryAfterSeconds }) };

  const body = await readProblemBody(response);
  const kind = isRecord(body) ? toProblemKind(body.type) : null;
  if (!isRecord(body) || kind === null) return new ApiError('desconocido', base);

  return new ApiError(kind, {
    ...base,
    ...(typeof body.title === 'string' ? { title: body.title } : {}),
    fields: toFieldNames(body.errores),
  });
}
