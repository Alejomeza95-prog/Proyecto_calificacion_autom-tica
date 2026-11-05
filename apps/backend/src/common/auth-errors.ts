/**
 * Errores de dominio de autenticación. La traducción a `application/problem+json` es de la capa HTTP
 * (Fase 3). Ninguno lleva datos de la cuenta.
 */

/** 429: límite atribuible al cliente alcanzado (DEC-15). */
export class TooManyAttemptsError extends Error {
  constructor(readonly retryAfterS: number | undefined) {
    super('Demasiados intentos');
    this.name = 'TooManyAttemptsError';
  }
}

export type ServiceUnavailableType = 'limitador-no-disponible' | 'servicio-saturado' | 'verificacion-no-disponible';

/** 503: capacidad o disponibilidad del servicio (DEC-06, DEC-16, DEC-17). */
export class ServiceUnavailableError extends Error {
  constructor(
    readonly type: ServiceUnavailableType,
    readonly retryAfterS: number,
  ) {
    super('Servicio temporalmente no disponible');
    this.name = 'ServiceUnavailableError';
  }
}

/** 401 `desafio-requerido` (DEC-16). */
export class ChallengeRequiredError extends Error {
  constructor() {
    super('Se requiere verificación adicional');
    this.name = 'ChallengeRequiredError';
  }
}

/** 401 genérico de credenciales (CA-07). */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Credenciales inválidas');
    this.name = 'InvalidCredentialsError';
  }
}

/** 400 `enlace-invalido`: token inexistente, vencido, usado, reemplazado o cuenta no elegible (genérico). */
export class InvalidLinkError extends Error {
  constructor() {
    super('Enlace inválido');
    this.name = 'InvalidLinkError';
  }
}

/** 422: la contraseña no cumple la política publicada (CA-03). Lleva solo el motivo, nunca el valor. */
export class PasswordPolicyError extends Error {
  constructor(readonly reason: 'DEMASIADO_CORTA' | 'DEMASIADO_LARGA') {
    super('La contraseña no cumple la política');
    this.name = 'PasswordPolicyError';
  }
}
