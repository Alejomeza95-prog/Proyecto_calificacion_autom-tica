import { HttpException } from '@nestjs/common';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../auth/password/password-policy';

/**
 * Formato de error `application/problem+json` (RFC 9457) del proyecto (plan §8).
 * `type` es un URN estable que el frontend puede comparar; `title` es genérico y nunca lleva datos de
 * la cuenta, del token ni del valor recibido.
 */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';
export const PROBLEM_TYPE_PREFIX = 'urn:omr-preicfes:problema:';

export const ProblemType = {
  SOLICITUD_INVALIDA: 'solicitud-invalida',
  NO_AUTENTICADO: 'no-autenticado',
  CREDENCIALES_INVALIDAS: 'credenciales-invalidas',
  DESAFIO_REQUERIDO: 'desafio-requerido',
  ACCESO_DENEGADO: 'acceso-denegado',
  ORIGEN_NO_PERMITIDO: 'origen-no-permitido',
  NO_ENCONTRADO: 'no-encontrado',
  ENLACE_INVALIDO: 'enlace-invalido',
  POLITICA_PASSWORD: 'politica-password',
  DEMASIADOS_INTENTOS: 'demasiados-intentos',
  LIMITADOR_NO_DISPONIBLE: 'limitador-no-disponible',
  SERVICIO_SATURADO: 'servicio-saturado',
  VERIFICACION_NO_DISPONIBLE: 'verificacion-no-disponible',
  ERROR_INTERNO: 'error-interno',
  // HT-AUTH-03 (plan §8): estado no pendiente, duplicado, versión desactualizada o clave publicada.
  CONFLICTO: 'conflicto',
  // HT-AUTH-03 (plan §8, CA-10): publicar una clave con preguntas sin respuesta.
  CLAVE_INCOMPLETA: 'clave-incompleta',
} as const;
export type ProblemType = (typeof ProblemType)[keyof typeof ProblemType];

export const PROBLEM_TITLES: Readonly<Record<ProblemType, string>> = {
  'solicitud-invalida': 'La solicitud no es válida',
  'no-autenticado': 'No autenticado',
  'credenciales-invalidas': 'Correo o contraseña incorrectos',
  'desafio-requerido': 'Se requiere una verificación de seguridad adicional',
  'acceso-denegado': 'Acceso denegado',
  'origen-no-permitido': 'Acceso denegado',
  'no-encontrado': 'Recurso no encontrado',
  'enlace-invalido': 'El enlace no es válido o ya venció. Solicita uno nuevo',
  'politica-password': `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres`,
  'demasiados-intentos': 'Demasiados intentos. Intenta de nuevo más tarde',
  'limitador-no-disponible': 'Servicio temporalmente no disponible',
  'servicio-saturado': 'Servicio temporalmente no disponible',
  'verificacion-no-disponible':
    'No podemos completar la verificación de seguridad en este momento. Intenta de nuevo en unos minutos.',
  'error-interno': 'Error interno',
  conflicto: 'El recurso cambió o ya no está en el estado esperado',
  'clave-incompleta': 'La clave tiene preguntas sin respuesta',
};

/** Error de un campo del cuerpo: nombre y reglas incumplidas, nunca el valor recibido (DEC-21). */
export interface FieldError {
  readonly campo: string;
  readonly reglas: readonly string[];
}

/**
 * Miembros de extensión del problema (RFC 9457 §3.2). Solo datos no sensibles que el cliente necesita
 * para corregir la solicitud, p. ej. `preguntasFaltantes` al publicar una clave incompleta (HT-AUTH-03).
 */
export interface ProblemExtensions {
  readonly preguntasFaltantes?: readonly number[];
}

export interface ProblemBody extends ProblemExtensions {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly errores?: readonly FieldError[];
}

export function problemBody(
  status: number,
  type: ProblemType,
  errores?: readonly FieldError[],
  extensions?: ProblemExtensions,
): ProblemBody {
  return {
    type: `${PROBLEM_TYPE_PREFIX}${type}`,
    title: PROBLEM_TITLES[type],
    status,
    ...(errores ? { errores } : {}),
    ...(extensions ?? {}),
  };
}

/** Excepción HTTP con un tipo de problema explícito (la traduce `ProblemJsonFilter`). */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly problemType: ProblemType,
    readonly errores?: readonly FieldError[],
    readonly extensions?: ProblemExtensions,
  ) {
    super(PROBLEM_TITLES[problemType], status);
    this.name = 'ProblemException';
  }
}
