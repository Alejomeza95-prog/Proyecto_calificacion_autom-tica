import type { Role } from '../auth/api/types.ts';

/**
 * Copia de `apps/backend/src/authz/permissions.ts` (HT-AUTH-03 DEC-06). Solo decide qué se muestra:
 * la autorización real la aplica el backend (RN-05).
 */
export const ROLES_LECTURA_CLAVES: readonly Role[] = ['ADMIN', 'COORDINADOR', 'DOCENTE'];
export const ROLES_EDICION_CLAVES: readonly Role[] = ['ADMIN', 'COORDINADOR'];
export const ROLES_REVISION_MANUAL: readonly Role[] = ['ADMIN', 'COORDINADOR'];
export const ROLES_USUARIOS: readonly Role[] = ['ADMIN'];

export function hasRole(rol: Role | null, allowed: readonly Role[]): boolean {
  return rol !== null && allowed.includes(rol);
}
