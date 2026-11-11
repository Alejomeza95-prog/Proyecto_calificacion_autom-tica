import type { mongo } from 'mongoose';
import { INDEX_NOT_FOUND, NAMESPACE_NOT_FOUND, mongoErrorCode, type MigrationContext } from './migration-context';

/**
 * 003-ht-auth-03-indices (HT-AUTH-03 plan §4 y §7, T-05). Crea las colecciones nuevas si no existen y
 * los índices con nombre fijo. Los de `resoluciones_manuales` se crean en OMR-002 (DEC-07).
 * `down` elimina solo estos índices por nombre: no borra datos ni colecciones.
 * Idempotente: `createIndex` con la misma especificación no cambia nada.
 */

interface IndexDef {
  readonly collection: string;
  readonly name: string;
  readonly key: mongo.IndexSpecification;
  readonly options?: Omit<mongo.CreateIndexesOptions, 'name'>;
}

const ES_CASE_INSENSITIVE: mongo.CollationOptions = { locale: 'es', strength: 2 };

export const HT_AUTH_03_INDEXES: readonly IndexDef[] = [
  // CA-01: listado de pendientes ordenado por fecha de registro.
  { collection: 'usuarios', name: 'ix_usuarios_estado_creado', key: { estado: 1, creado_en: 1 } },
  // DEC-03: siembra idempotente sin instituciones homónimas.
  {
    collection: 'instituciones',
    name: 'ux_instituciones_nombre',
    key: { nombre: 1 },
    options: { unique: true, collation: ES_CASE_INSENSITIVE },
  },
  // CA-06: sin pruebas homónimas por institución; listado por institución.
  {
    collection: 'pruebas',
    name: 'ux_pruebas_institucion_nombre',
    key: { institucion_id: 1, nombre: 1 },
    options: { unique: true, collation: ES_CASE_INSENSITIVE },
  },
  // RN-07, CA-08: una clave por prueba + fecha + sesión + materia en la institución.
  {
    collection: 'claves_respuesta',
    name: 'ux_claves_identidad',
    key: { institucion_id: 1, prueba_id: 1, fecha: 1, sesion: 1, materia: 1 },
    options: { unique: true },
  },
  // CA-11: listado por alcance y estado, más recientes primero.
  {
    collection: 'claves_respuesta',
    name: 'ix_claves_institucion_estado_fecha',
    key: { institucion_id: 1, estado: 1, fecha: -1 },
  },
  // CA-14: historial de un recurso.
  {
    collection: 'auditoria_admin',
    name: 'ix_auditoria_admin_recurso',
    key: { recurso_tipo: 1, recurso_id: 1, creado_en: -1 },
  },
];

const COLLECTIONS = ['instituciones', 'pruebas', 'claves_respuesta', 'auditoria_admin'] as const;

export async function up({ db }: MigrationContext): Promise<void> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) await db.createCollection(name);
  }
  for (const index of HT_AUTH_03_INDEXES) {
    await db.collection(index.collection).createIndex(index.key, { ...index.options, name: index.name });
  }
}

export async function down({ db }: MigrationContext): Promise<void> {
  for (const index of [...HT_AUTH_03_INDEXES].reverse()) {
    try {
      await db.collection(index.collection).dropIndex(index.name);
    } catch (error) {
      const code = mongoErrorCode(error);
      if (code !== INDEX_NOT_FOUND && code !== NAMESPACE_NOT_FOUND) throw error;
    }
  }
}
