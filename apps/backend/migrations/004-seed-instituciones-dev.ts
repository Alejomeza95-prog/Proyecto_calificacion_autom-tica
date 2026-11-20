import { Types } from 'mongoose';
import type { MigrationContext } from './migration-context';

/**
 * 004-seed-instituciones-dev (HT-AUTH-03 plan §3.2 y §7, DEC-03, T-01). Solo desarrollo y pruebas:
 * siembra las dos instituciones cuyos ObjectId ya usan las cuentas de `002-seed-roles-dev`.
 * - Se niega con NODE_ENV=production (y el runner la omite en producción). En producción las
 *   instituciones se dan de alta con el comando `pnpm instituciones:crear` (idempotente).
 * - Idempotente: upsert por `_id` con `$setOnInsert`.
 * - Reversión: borra solo los documentos con el marcador `seed: true`.
 */

export const nonProductionOnly = true;

export const SEED_INSTITUCIONES = [
  { _id: new Types.ObjectId('64a000000000000000000001'), nombre: 'Institución Semilla A' },
  { _id: new Types.ObjectId('64b000000000000000000002'), nombre: 'Institución Semilla B' },
] as const;

export async function up({ db, nodeEnv }: MigrationContext): Promise<void> {
  if (nodeEnv === 'production') {
    throw new Error('004-seed-instituciones-dev: no se ejecuta con NODE_ENV=production');
  }
  const instituciones = db.collection('instituciones');
  for (const inst of SEED_INSTITUCIONES) {
    const now = new Date();
    await instituciones.updateOne(
      { _id: inst._id },
      {
        $setOnInsert: {
          schemaVersion: 1,
          nombre: inst.nombre,
          activa: true,
          creado_en: now,
          actualizado_en: now,
          seed: true,
        },
      },
      { upsert: true },
    );
  }
}

export async function down({ db }: MigrationContext): Promise<void> {
  await db.collection('instituciones').deleteMany({ seed: true });
}
