import { PRIVATE_ROUTES, ROUTES } from '../../../app/routes.ts';

/** Ruta privada solicitada sin sesión. Solo en memoria: no hay parámetro `redirect` en la URL (RN-16). */
let requested: string | null = null;

export function rememberReturnPath(path: string): void {
  requested = path;
}

export function getReturnPath(): string | null {
  return requested;
}

export function forgetReturnPath(): void {
  requested = null;
}

function isInternalPath(path: string): boolean {
  return /^\/(?![/\\])/.test(path) && !path.includes('\\') && !/^[a-z][a-z0-9+.-]*:/i.test(path);
}

/** Solo admite una ruta privada interna y registrada; cualquier otro valor lleva a `/inicio` (CA-15, RN-16). */
export function safeReturnPath(candidate: string | null, allowed: readonly string[] = PRIVATE_ROUTES): string {
  return candidate !== null && isInternalPath(candidate) && allowed.includes(candidate) ? candidate : ROUTES.inicio;
}
