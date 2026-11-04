import { ConsoleLogger } from '@nestjs/common';
import { redact } from './redact';

/**
 * Logger de NestJS con redactor (plan §11, T-10): todo mensaje y parámetro pasa por `redact` antes
 * de escribirse. Se instala con `app.useLogger(new RedactingLogger())`.
 */
export class RedactingLogger extends ConsoleLogger {
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
