import type { Role } from '../auth/api/types.ts';

/** Nombres visibles de los roles (HT-AUTH-02 HomePage; HT-AUTH-03 menú y panel de usuarios). */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente',
};
