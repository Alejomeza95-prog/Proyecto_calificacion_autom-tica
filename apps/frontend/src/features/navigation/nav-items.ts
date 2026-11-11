import { APP_ROUTES, ROUTES } from '../../app/routes.ts';
import type { Role } from '../auth/api/types.ts';
import { ROLES_LECTURA_CLAVES, ROLES_USUARIOS } from './permissions.ts';

export interface NavItem {
  readonly key: 'inicio' | 'claves' | 'usuarios';
  readonly label: string;
  readonly path: string;
  /** `null`: cualquier cuenta ACTIVA. */
  readonly roles: readonly Role[] | null;
}

/** Opciones del menú lateral (HT-AUTH-03 CA-04, RN-05), en el orden en que se muestran. */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'inicio', label: 'Inicio', path: ROUTES.inicio, roles: null },
  { key: 'claves', label: 'Claves de respuesta', path: APP_ROUTES.claves, roles: ROLES_LECTURA_CLAVES },
  { key: 'usuarios', label: 'Usuarios', path: APP_ROUTES.usuarios, roles: ROLES_USUARIOS },
];

/** Opciones visibles para el rol: ocultar no reemplaza la autorización del backend (RN-05). */
export function navItemsFor(rol: Role | null): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles === null || (rol !== null && item.roles.includes(rol)));
}
