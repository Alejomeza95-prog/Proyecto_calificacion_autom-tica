/** Catálogo de roles (spec §8.1, DEC-11). Único lugar donde se define. */
export const Role = {
  ADMIN: 'ADMIN',
  COORDINADOR: 'COORDINADOR',
  DOCENTE: 'DOCENTE',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES: readonly Role[] = Object.values(Role);

export type RoleScope = 'GLOBAL' | 'INSTITUCIONAL';

/** Alcance de cada rol: ADMIN global sin institución; COORDINADOR y DOCENTE con institución obligatoria (RN-15). */
export const ROLE_SCOPE: Readonly<Record<Role, RoleScope>> = {
  ADMIN: 'GLOBAL',
  COORDINADOR: 'INSTITUCIONAL',
  DOCENTE: 'INSTITUCIONAL',
};

export const INSTITUTIONAL_ROLES: readonly Role[] = ROLES.filter((r) => ROLE_SCOPE[r] === 'INSTITUCIONAL');
export const GLOBAL_ROLES: readonly Role[] = ROLES.filter((r) => ROLE_SCOPE[r] === 'GLOBAL');

/**
 * RN-15: rol e institución coherentes. Devuelve el motivo del rechazo o `null` si es válido.
 * Una cuenta ACTIVA exige rol; un rol institucional ACTIVO exige institución; un rol global no la tiene.
 */
export function roleInstitutionViolation(
  estado: string,
  rol: Role | null,
  institucionId: unknown,
): string | null {
  if (rol !== null && ROLE_SCOPE[rol] === 'GLOBAL' && institucionId != null) {
    return `el rol ${rol} no está ligado a una institución`;
  }
  if (estado !== 'ACTIVA') return null;
  if (rol === null) return 'una cuenta ACTIVA exige un rol del catálogo';
  if (ROLE_SCOPE[rol] === 'INSTITUCIONAL' && institucionId == null) {
    return `el rol ${rol} ACTIVO exige una institución`;
  }
  return null;
}
