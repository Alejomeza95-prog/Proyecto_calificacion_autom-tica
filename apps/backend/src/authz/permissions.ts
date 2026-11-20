import { Role } from './role';

/**
 * Permisos de negocio de HT-AUTH-03 (spec §8, plan DEC-06). Único lugar donde se definen; los usan los
 * controladores (`@Roles(...)`) y las pruebas de la matriz rol × ruta.
 */
/** Consultar claves de respuesta y pruebas. */
export const ROLES_LECTURA_CLAVES = [Role.ADMIN, Role.COORDINADOR, Role.DOCENTE] as const;
/** Crear, editar, publicar y eliminar claves; crear pruebas. */
export const ROLES_EDICION_CLAVES = [Role.ADMIN, Role.COORDINADOR] as const;
/** Verificar marcas dudosas en revisión manual. */
export const ROLES_REVISION_MANUAL = [Role.ADMIN, Role.COORDINADOR] as const;
