import * as argon2 from 'argon2';
import { Types } from 'mongoose';
import type { MigrationContext } from './migration-context';

/**
 * 002-seed-roles-dev (plan §7, T-05). Solo desarrollo y pruebas: cuentas ACTIVA por rol, de dos
 * instituciones con ObjectId fijos, con correos `@example.test` (sin datos personales reales).
 * - Se niega con NODE_ENV=production (y el runner la omite en producción).
 * - La contraseña de las cuentas sembradas no se versiona: se lee de SEED_DEV_PASSWORD.
 * - Idempotente: upsert por correo con `$setOnInsert`; una segunda ejecución no cambia nada.
 * - Reversión: borra solo los documentos con el marcador `seed: true`.
 */

export const nonProductionOnly = true;

export const SEED_INSTITUCION_A = new Types.ObjectId('64a000000000000000000001');
export const SEED_INSTITUCION_B = new Types.ObjectId('64b000000000000000000002');

export const SEED_ACCOUNTS = [
  { correo: 'admin.seed@example.test', nombre: 'Admin Semilla', rol: 'ADMIN', institucion: null },
  { correo: 'coordinador.a@example.test', nombre: 'Coordinador A', rol: 'COORDINADOR', institucion: SEED_INSTITUCION_A },
  { correo: 'docente.a@example.test', nombre: 'Docente A', rol: 'DOCENTE', institucion: SEED_INSTITUCION_A },
  { correo: 'coordinador.b@example.test', nombre: 'Coordinador B', rol: 'COORDINADOR', institucion: SEED_INSTITUCION_B },
  { correo: 'docente.b@example.test', nombre: 'Docente B', rol: 'DOCENTE', institucion: SEED_INSTITUCION_B },
] as const;

const MIN_PASSWORD_LENGTH = 12;

export async function up({ db, nodeEnv, env }: MigrationContext): Promise<void> {
  if (nodeEnv === 'production') {
    throw new Error('002-seed-roles-dev: no se ejecuta con NODE_ENV=production');
  }
  const password = env.SEED_DEV_PASSWORD;
  if (!password || Array.from(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(`002-seed-roles-dev: definir SEED_DEV_PASSWORD (al menos ${MIN_PASSWORD_LENGTH} caracteres)`);
  }
  const usuarios = db.collection('usuarios');
  for (const account of SEED_ACCOUNTS) {
    const exists = await usuarios.countDocuments({ correo_normalizado: account.correo }, { limit: 1 });
    if (exists > 0) continue;
    const now = new Date();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    await usuarios.updateOne(
      { correo_normalizado: account.correo },
      {
        $setOnInsert: {
          schemaVersion: 1,
          nombre: account.nombre,
          correo_normalizado: account.correo,
          password_hash: passwordHash,
          estado: 'ACTIVA',
          rol: account.rol,
          institucion_id: account.institucion,
          origen: 'INVITACION',
          correo_verificado_en: now,
          ultimo_acceso_en: null,
          credenciales_actualizadas_en: now,
          version_credenciales: 0,
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
  await db.collection('usuarios').deleteMany({ seed: true });
}
