import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import { redactText } from '../../audit/redact';
import {
  ChallengeRequiredError,
  InvalidCredentialsError,
  ServiceUnavailableError,
  TooManyAttemptsError,
} from '../auth-errors';
import type { HttpResponse } from './http-types';
import { PROBLEM_CONTENT_TYPE, ProblemException, problemBody, ProblemType, type FieldError } from './problem';

interface Translated {
  readonly status: number;
  readonly type: ProblemType;
  readonly retryAfterS?: number;
  readonly errores?: readonly FieldError[];
}

/** Tipo de problema genérico por código HTTP (excepciones de Nest sin tipo explícito). */
function typeForStatus(status: number): ProblemType {
  switch (status) {
    case 400:
      return ProblemType.SOLICITUD_INVALIDA;
    case 401:
      return ProblemType.NO_AUTENTICADO;
    case 403:
      return ProblemType.ACCESO_DENEGADO;
    case 404:
      return ProblemType.NO_ENCONTRADO;
    case 429:
      return ProblemType.DEMASIADOS_INTENTOS;
    default:
      return status >= 500 ? ProblemType.ERROR_INTERNO : ProblemType.SOLICITUD_INVALIDA;
  }
}

/**
 * Traduce todos los errores a `application/problem+json` (plan §8, DEC-21).
 * - 429 y 503 llevan `Retry-After` (DEC-06, DEC-15, DEC-16, DEC-17).
 * - El cuerpo es genérico: nunca incluye el mensaje original, la traza, el valor recibido ni datos de
 *   la cuenta. Los errores no previstos se registran en el log (con redacción, T-10) y responden 500.
 */
@Catch()
export class ProblemJsonFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemJsonFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const t = this.translate(exception);
    if (t.retryAfterS !== undefined) response.setHeader('Retry-After', String(t.retryAfterS));
    response.setHeader('Content-Type', PROBLEM_CONTENT_TYPE);
    response.setHeader('Cache-Control', 'no-store');
    response.status(t.status).json(problemBody(t.status, t.type, t.errores));
  }

  private translate(exception: unknown): Translated {
    if (exception instanceof TooManyAttemptsError) {
      return { status: 429, type: ProblemType.DEMASIADOS_INTENTOS, retryAfterS: exception.retryAfterS };
    }
    if (exception instanceof ServiceUnavailableError) {
      return { status: 503, type: exception.type, retryAfterS: exception.retryAfterS };
    }
    if (exception instanceof ChallengeRequiredError) return { status: 401, type: ProblemType.DESAFIO_REQUERIDO };
    if (exception instanceof InvalidCredentialsError) return { status: 401, type: ProblemType.CREDENCIALES_INVALIDAS };
    if (exception instanceof ProblemException) {
      return { status: exception.getStatus(), type: exception.problemType, errores: exception.errores };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) this.logUnexpected(exception);
      return { status, type: typeForStatus(status) };
    }
    this.logUnexpected(exception);
    return { status: 500, type: ProblemType.ERROR_INTERNO };
  }

  /**
   * Registra el error no previsto con el redactor centralizado aplicado **aquí** (nombre, mensaje y
   * stack), además del `RedactingLogger` global: así no depende de que `configureApp` haya instalado el
   * logger (pruebas, arranque) para no escribir secretos (T-10, RN-12). Conserva el resto del
   * diagnóstico: tipo de error, mensaje sin secretos, host y puerto de las URI y la traza.
   */
  private logUnexpected(exception: unknown): void {
    if (exception instanceof Error) {
      this.logger.error(redactText(`${exception.name}: ${exception.message}`), exception.stack ? redactText(exception.stack) : undefined);
    } else {
      this.logger.error('Error no previsto sin detalle');
    }
  }
}
