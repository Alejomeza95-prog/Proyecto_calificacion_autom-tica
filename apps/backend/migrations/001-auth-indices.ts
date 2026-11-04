import type { mongo } from 'mongoose';
import { INDEX_NOT_FOUND, NAMESPACE_NOT_FOUND, mongoErrorCode, type MigrationContext } from './migration-context';

/**
 * 001-auth-indices (plan §4 y §7, T-04, T-05). Crea las colecciones si no existen y cada índice de §4
 * con nombre fijo. `down` elimina solo esos índices por nombre: no borra datos ni colecciones.
 * Idempotente: `createIndex` con la misma especificación no cambia nada.
 */

interface IndexDef {
  readonly collection: string;
  readonly name: string;
  readonly key: mongo.IndexSpecification;
  readonly options?: Omit<mongo.CreateIndexesOptions, 'name'>;
}

export const AUTH_INDEXES: readonly IndexDef[] = [
  { collection: 'usuarios', name: 'ux_usuarios_correo', key: { correo_normalizado: 1 }, options: { unique: true } },
  {
    collection: 'usuarios',
    name: 'ux_usuarios_bootstrap',
    key: { origen: 1 },
    options: { unique: true, partialFilterExpression: { origen: 'BOOTSTRAP' } },
  },
  { collection: 'usuarios', name: 'ix_usuarios_rol_estado', key: { rol: 1, estado: 1 } },
  { collection: 'tokens_seguridad', name: 'ux_tokens_hash', key: { token_hash: 1 }, options: { unique: true } },
  {
    collection: 'tokens_seguridad',
    name: 'ix_tokens_usuario_proposito_vigentes',
    key: { usuario_id: 1, proposito: 1 },
    options: { partialFilterExpression: { usado_en: null, invalidado_en: null } },
  },
  {
    collection: 'tokens_seguridad',
    name: 'ttl_tokens_expira',
    key: { expira_en: 1 },
    options: { expireAfterSeconds: 86_400 },
  },
  {
    collection: 'sesiones',
    name: 'ix_sesiones_usuario_vigentes',
    key: { usuario_id: 1 },
    options: { partialFilterExpression: { revocada_en: null } },
  },
  { collection: 'sesiones', name: 'ux_sesiones_refresh_hash', key: { refresh_hash: 1 }, options: { unique: true } },
  { collection: 'sesiones', name: 'ix_sesiones_refresh_previos', key: { refresh_hashes_previos: 1 } },
  { collection: 'sesiones', name: 'ttl_sesiones_expira', key: { expira_en: 1 }, options: { expireAfterSeconds: 0 } },
  { collection: 'auditoria_auth', name: 'ix_auditoria_usuario_fecha', key: { usuario_id: 1, creado_en: -1 } },
];

const COLLECTIONS = ['usuarios', 'tokens_seguridad', 'sesiones', 'auditoria_auth'] as const;

export async function up({ db }: MigrationContext): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) await db.createCollection(name);
  }
  for (const index of AUTH_INDEXES) {
    await db.collection(index.collection).createIndex(index.key, { ...index.options, name: index.name });
  }
}

export async function down({ db }: MigrationContext): Promise<void> {
  for (const index of [...AUTH_INDEXES].reverse()) {
    try {
      await db.collection(index.collection).dropIndex(index.name);
    } catch (error) {
      const code = mongoErrorCode(error);
      if (code !== INDEX_NOT_FOUND && code !== NAMESPACE_NOT_FOUND) throw error;
    }
  }
}
