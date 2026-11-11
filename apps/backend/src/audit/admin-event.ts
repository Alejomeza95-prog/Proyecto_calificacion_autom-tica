/** Eventos de auditoría de administración y negocio (HT-AUTH-03 plan §3.5, RN-17). */
export const AdminEvent = {
  CUENTA_APROBADA: 'CUENTA_APROBADA',
  PRUEBA_CREADA: 'PRUEBA_CREADA',
  CLAVE_CREADA: 'CLAVE_CREADA',
  CLAVE_ACTUALIZADA: 'CLAVE_ACTUALIZADA',
  CLAVE_PUBLICADA: 'CLAVE_PUBLICADA',
  CLAVE_ELIMINADA: 'CLAVE_ELIMINADA',
  MARCA_VERIFICADA: 'MARCA_VERIFICADA',
} as const;
export type AdminEvent = (typeof AdminEvent)[keyof typeof AdminEvent];
export const ADMIN_EVENTS: readonly AdminEvent[] = Object.values(AdminEvent);

export const RecursoTipo = {
  USUARIO: 'usuario',
  PRUEBA: 'prueba',
  CLAVE_RESPUESTA: 'clave_respuesta',
  RESOLUCION_MANUAL: 'resolucion_manual',
} as const;
export type RecursoTipo = (typeof RecursoTipo)[keyof typeof RecursoTipo];
export const RECURSO_TIPOS: readonly RecursoTipo[] = Object.values(RecursoTipo);
