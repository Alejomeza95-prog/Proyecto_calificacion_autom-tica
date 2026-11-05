import type { mongo } from 'mongoose';

/**
 * Contexto que reciben los scripts de migración. Es estructuralmente igual a
 * `MigrationContext` de `src/database/migration-runner.ts`: los scripts no importan `src`
 * porque se compilan por separado (`tsconfig.migrations.json`).
 */
export interface MigrationContext {
  readonly db: mongo.Db;
  readonly nodeEnv: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** Códigos de MongoDB que hacen idempotente la reversión. */
export const NAMESPACE_NOT_FOUND = 26;
export const INDEX_NOT_FOUND = 27;

export function mongoErrorCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'number' ? error.code : undefined;
  }
  return undefined;
}
