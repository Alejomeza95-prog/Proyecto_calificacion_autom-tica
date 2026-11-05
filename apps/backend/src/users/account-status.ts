/** Estados de cuenta (spec §7, RN-01). */
export const AccountStatus = {
  PENDIENTE_VERIFICACION: 'PENDIENTE_VERIFICACION',
  PENDIENTE_APROBACION: 'PENDIENTE_APROBACION',
  ACTIVA: 'ACTIVA',
  BLOQUEADA: 'BLOQUEADA',
  DESACTIVADA: 'DESACTIVADA',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];
export const ACCOUNT_STATUSES: readonly AccountStatus[] = Object.values(AccountStatus);

/**
 * Transiciones respaldadas por la spec y el plan:
 * - PENDIENTE_VERIFICACION → PENDIENTE_APROBACION: verificación de un autorregistro (RN-01, DEC-07).
 * - PENDIENTE_VERIFICACION → ACTIVA: verificación de una invitación con rol asignado (DEC-07) o activación del
 *   primer administrador (plan §5).
 * - PENDIENTE_APROBACION → ACTIVA: aprobación administrativa (RN-01; operación de una historia posterior).
 * - ACTIVA → BLOQUEADA | DESACTIVADA: la cuenta deja de estar ACTIVA (plan §5, historia posterior).
 * Reactivar una cuenta BLOQUEADA o DESACTIVADA no está definido por la spec: no se inventa aquí.
 */
const TRANSITIONS: Readonly<Record<AccountStatus, readonly AccountStatus[]>> = {
  PENDIENTE_VERIFICACION: ['PENDIENTE_APROBACION', 'ACTIVA'],
  PENDIENTE_APROBACION: ['ACTIVA'],
  ACTIVA: ['BLOQUEADA', 'DESACTIVADA'],
  BLOQUEADA: [],
  DESACTIVADA: [],
};

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Estados elegibles para la recuperación de contraseña por autoservicio (DEC-19, RN-19). */
export const PASSWORD_RECOVERY_ELIGIBLE: readonly AccountStatus[] = ['ACTIVA', 'PENDIENTE_APROBACION'];
