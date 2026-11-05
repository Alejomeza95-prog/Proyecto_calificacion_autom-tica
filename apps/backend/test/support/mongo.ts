import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import mongoose, { type Connection } from 'mongoose';
import { loadMigrations, MigrationRunner, type MigrationDefinition } from '../../src/database/migration-runner';

/**
 * Base de datos aislada por suite sobre el MongoDB 7 de Compose (DEC-13).
 * La URI llega por MONGODB_URI (cargada con `--env-file-if-exists`); nunca se imprime.
 */
export interface TestDb {
  readonly connection: Connection;
  readonly db: mongoose.mongo.Db;
  readonly dbName: string;
  drop(): Promise<void>;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} no está definida: ejecutar las pruebas con el .env local (pnpm test:int)`);
  }
  return value;
}

export async function openTestDb(suite: string): Promise<TestDb> {
  const dbName = `omr_test_${suite}_${randomBytes(4).toString('hex')}`;
  const connection = await mongoose
    .createConnection(requireEnv('MONGODB_URI'), {
      dbName,
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 5_000,
    })
    .asPromise();
  const db = connection.db;
  if (!db) throw new Error('Conexión sin base de datos');
  return {
    connection,
    db,
    dbName,
    async drop() {
      await db.dropDatabase();
      await connection.close();
    },
  };
}

export const MIGRATIONS_DIR = resolve(__dirname, '..', '..', 'migrations');

export function authMigrations(): MigrationDefinition[] {
  return loadMigrations(MIGRATIONS_DIR);
}

/** Aplica las migraciones reales sobre la base aislada (plan §7: las suites ejecutan `migrate:up`). */
export async function migrateUp(testDb: TestDb, onlyIndexes = true): Promise<void> {
  const migrations = authMigrations().filter((m) => !onlyIndexes || m.id === '001-auth-indices');
  await new MigrationRunner({ db: testDb.db, nodeEnv: 'test', env: process.env }, migrations).up();
}

/**
 * Solo para pruebas que envían a propósito datos fuera del contrato (para comprobar que el esquema
 * los rechaza). Hace explícito en el código que el valor es inválido.
 */
export function deliberatelyInvalid<T>(value: Record<string, unknown>): T {
  return value as T;
}
