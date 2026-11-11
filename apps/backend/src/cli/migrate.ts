import { resolve } from 'node:path';
import mongoose from 'mongoose';
import {
  loadMigrations,
  MigrationEnvironmentError,
  MigrationRunner,
  resolveMigrationNodeEnv,
} from '../database/migration-runner';

/**
 * `pnpm migrate:up | migrate:down [--to <id>] | migrate:status` (plan §7, DEC-12, T-38).
 * Requiere `pnpm build` (los scripts compilados viven en `dist/migrations`).
 * Solo usa MONGODB_URI y NODE_ENV; nunca imprime la URI ni otros valores de configuración.
 * DEC-28: `NODE_ENV` es obligatoria, sin valor por defecto (código 2 antes de conectar); las semillas
 * solo se aplican con `development` o `test`.
 */
async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0];
  if (command !== 'up' && command !== 'down' && command !== 'status') {
    process.stderr.write('Uso: migrate <up|down|status> [--to <id>]\n');
    return 2;
  }
  const toIndex = argv.indexOf('--to');
  const to = toIndex >= 0 ? argv[toIndex + 1] : undefined;

  let nodeEnv: string;
  try {
    nodeEnv = resolveMigrationNodeEnv(process.env);
  } catch (error) {
    if (!(error instanceof MigrationEnvironmentError)) throw error;
    process.stderr.write(`${error.message}\n`);
    return 2;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    process.stderr.write('MONGODB_URI no está definida\n');
    return 2;
  }

  const connection = await mongoose
    .createConnection(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10_000 })
    .asPromise();
  try {
    const db = connection.db;
    if (!db) throw new Error('Conexión a MongoDB sin base de datos');
    const runner = new MigrationRunner(
      { db, nodeEnv, env: process.env },
      loadMigrations(resolve(__dirname, '..', 'migrations')),
      (message) => process.stdout.write(`${message}\n`),
      (message) => process.stderr.write(`${message}\n`),
    );
    if (command === 'status') {
      for (const s of await runner.status()) {
        process.stdout.write(`${s.applied ? '[x]' : '[ ]'} ${s.id}${s.skipped ? ' (omitida: solo development/test)' : ''}\n`);
      }
    } else if (command === 'up') {
      const applied = await runner.up();
      process.stdout.write(applied.length ? `Aplicadas: ${applied.join(', ')}\n` : 'Sin migraciones pendientes\n');
    } else {
      const reverted = await runner.down(to);
      process.stdout.write(reverted.length ? `Revertidas: ${reverted.join(', ')}\n` : 'Nada que revertir\n');
    }
    return 0;
  } finally {
    await connection.close();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`Error en migraciones: ${error instanceof Error ? error.message : 'desconocido'}\n`);
    process.exit(1);
  },
);
