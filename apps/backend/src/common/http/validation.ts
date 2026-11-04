import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { ProblemException, ProblemType, type FieldError } from './problem';

/** Aplana los errores anidados de class-validator a `campo` + reglas, sin valores ni mensajes. */
export function toFieldErrors(errors: readonly ValidationError[], parent = ''): FieldError[] {
  const result: FieldError[] = [];
  for (const error of errors) {
    const campo = parent ? `${parent}.${error.property}` : error.property;
    const reglas = Object.keys(error.constraints ?? {});
    if (reglas.length > 0) result.push({ campo, reglas });
    if (error.children?.length) result.push(...toFieldErrors(error.children, campo));
  }
  return result;
}

/**
 * `ValidationPipe` global según DEC-21 (plan §9.1):
 * - `whitelist` + `forbidNonWhitelisted`: una propiedad no declarada → 400 (nunca llega al servicio).
 * - `forbidUnknownValues`: un cuerpo que no corresponde a una clase DTO se rechaza.
 * - `transform` sin conversión implícita: solo `@Type`/`@Transform` declarados en la propiedad.
 * - Los errores no exponen el objeto ni el valor (`target`/`value` en `false`) y se traducen a
 *   `application/problem+json` con el nombre del campo y las reglas incumplidas.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validationError: { target: false, value: false },
    transformOptions: { enableImplicitConversion: false },
    stopAtFirstError: false,
    exceptionFactory: (errors) => new ProblemException(400, ProblemType.SOLICITUD_INVALIDA, toFieldErrors(errors)),
  });
}
