/** Catálogos de claves de respuesta (HT-AUTH-03 spec RN-06, RN-08, RN-09, RN-10; plan §3.4 y §9.1). */

/** Áreas oficiales (CLAUDE.md): Matemáticas, Ciencias Naturales, Competencias Ciudadanas, Lectura Crítica, Inglés. */
export const MATERIAS = ['MAT', 'CN', 'CC', 'LC', 'ING'] as const;
export type Materia = (typeof MATERIAS)[number];

/** Únicos valores válidos de una respuesta de clave (RN-09). */
export const OPCIONES_CLAVE = ['A', 'B', 'C', 'D'] as const;
export type OpcionClave = (typeof OPCIONES_CLAVE)[number];

/** Sesiones de aplicación (spec §12, resuelta el 2026-11-11). */
export const SESIONES = ['SESION_1', 'SESION_2'] as const;
export type Sesion = (typeof SESIONES)[number];

/** Límite de preguntas por materia (RN-08). */
export const MIN_PREGUNTAS = 1;
export const MAX_PREGUNTAS = 100;

export const EstadoClave = {
  BORRADOR: 'BORRADOR',
  PUBLICADA: 'PUBLICADA',
} as const;
export type EstadoClave = (typeof EstadoClave)[keyof typeof EstadoClave];
export const ESTADOS_CLAVE: readonly EstadoClave[] = Object.values(EstadoClave);

/** Respuesta de una pregunta: una opción o `null` mientras el Borrador está incompleto (RN-10). */
export type RespuestaClave = OpcionClave | null;
