import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RedactingLogger } from '../audit/redacting-logger';
import { BootstrapAdminService } from '../bootstrap/bootstrap-admin.service';
import { BootstrapModule } from '../bootstrap/bootstrap.module';
import { runBootstrapAdminCli } from './bootstrap-admin-cli';

/**
 * `pnpm bootstrap:admin --nombre "<nombre>" --correo <correo>` (plan §2.1 y §8, DEC-08, T-35).
 * Requiere `pnpm build`. Contexto de Nest sin servidor HTTP; logger con redacción y solo errores y
 * avisos, para que la consola muestre únicamente el resultado genérico.
 */
async function openContext() {
  const logger = new RedactingLogger();
  logger.setLogLevels(['error', 'warn']);
  const app = await NestFactory.createApplicationContext(BootstrapModule, { logger });
  app.enableShutdownHooks();
  return { service: app.get(BootstrapAdminService), close: () => app.close() };
}

void runBootstrapAdminCli(
  process.argv.slice(2),
  process.env,
  { out: (line) => process.stdout.write(`${line}\n`), err: (line) => process.stderr.write(`${line}\n`) },
  openContext,
).then((code) => process.exit(code));
