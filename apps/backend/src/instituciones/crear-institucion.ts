import type { mongo } from 'mongoose';
import { INSTITUCIONES_COLLECTION } from './institucion.schema';

export const NOMBRE_MAX = 200;

/** Lee `--nombre "<nombre>"`; devuelve el nombre recortado o un mensaje de uso. */
export function parseCrearInstitucionArgs(argv: readonly string[]): { nombre: string } | { error: string } {
  const i = argv.indexOf('--nombre');
  const nombre = i >= 0 ? argv[i + 1]?.trim() : undefined;
  if (!nombre) return { error: 'Uso: instituciones:crear --nombre "<nombre>"' };
  if (nombre.length > NOMBRE_MAX) return { error: `El nombre admite como máximo ${NOMBRE_MAX} caracteres` };
  return { nombre };
}

/**
 * Alta idempotente de una institución (HT-AUTH-03 DEC-03, T-01): upsert por nombre, sin distinguir
 * mayúsculas (misma collation que `ux_instituciones_nombre`). Devuelve si se creó y el identificador.
 */
export async function crearInstitucion(
  db: mongo.Db,
  nombre: string,
  now: Date = new Date(),
): Promise<{ creada: boolean; id: string }> {
  const result = await db.collection(INSTITUCIONES_COLLECTION).findOneAndUpdate(
    { nombre },
    { $setOnInsert: { schemaVersion: 1, nombre, activa: true, creado_en: now, actualizado_en: now } },
    { upsert: true, returnDocument: 'after', includeResultMetadata: true, collation: { locale: 'es', strength: 2 } },
  );
  const id = result.value?._id;
  if (!id) throw new Error('No se pudo crear ni encontrar la institución');
  return { creada: result.lastErrorObject?.updatedExisting === false, id: id.toHexString() };
}
