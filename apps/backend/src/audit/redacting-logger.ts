import { ConsoleLogger, type ConsoleLoggerOptions, type LogLevel } from '@nestjs/common';
import { currentCorrelationId } from '../observability/request-context';
import { redact } from './redact';

/**
 * Logger de NestJS con redactor (plan §11, T-10): todo mensaje y parámetro pasa por `redact` antes
 * de escribirse. Se instala con `app.useLogger(new RedactingLogger())`.
 * T-47 (DEC-25): salida JSON de una línea por registro (`json: true` del `ConsoleLogger` de Nest) con el
 * `correlationId` de la solicitud en curso cuando existe. La redacción ocurre antes de serializar.
 */
export class RedactingLogger extends ConsoleLogger {
  constructor(options: ConsoleLoggerOptions = {}) {
    super({ json: true, ...options });
  }

  protected override getJsonLogObject(
    message: unknown,
    options: {
      context: string;
      logLevel: LogLevel;
      writeStreamType?: 'stdout' | 'stderr';
      errorStack?: unknown;
      params?: Record<string, unknown>;
      error?: Error;
    },
  ): ReturnType<ConsoleLogger['getJsonLogObject']> {
    const record = super.getJsonLogObject(message, options);
    const correlationId = currentCorrelationId();
    return correlationId ? { ...record, correlationId } : record;
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(redact(message), ...optionalParams.map((p) => redact(p)));
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(redact(message), ...optionalParams.map((p) => redact(p)));
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(redact(message), ...optionalParams.map((p) => redact(p)));
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(redact(message), ...optionalParams.map((p) => redact(p)));
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(redact(message), ...optionalParams.map((p) => redact(p)));
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(redact(message), ...optionalParams.map((p) => redact(p)));
  }
}
