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

/** Nombre de la institución que se crea al arrancar en desarrollo si el catálogo está vacío. */
export const INSTITUCION_POR_DEFECTO = 'Institución Educativa Demo';

export type ResultadoInstitucionPorDefecto =
  | { readonly accion: 'creada'; readonly id: string }
  | { readonly accion: 'omitida'; readonly motivo: 'entorno' | 'catalogo-con-datos' };

/**
 * Institución por defecto (HT-AUTH-03 T-34): solo con `NODE_ENV=development` y solo si `instituciones` está
 * vacía, crea {@link INSTITUCION_POR_DEFECTO} para que el ADMIN pueda dar de alta pruebas en una base limpia.
 * En `test` no actúa (cada suite siembra sus instituciones) y en producción tampoco: allí las altas siguen
 * siendo controladas con `instituciones:crear` (DEC-03). Idempotente: reutiliza el upsert por nombre.
 */
export async function asegurarInstitucionPorDefecto(
  db: mongo.Db,
  nodeEnv: string,
  now: Date = new Date(),
): Promise<ResultadoInstitucionPorDefecto> {
  if (nodeEnv !== 'development') return { accion: 'omitida', motivo: 'entorno' };
  const existentes = await db.collection(INSTITUCIONES_COLLECTION).countDocuments({}, { limit: 1 });
  if (existentes > 0) return { accion: 'omitida', motivo: 'catalogo-con-datos' };
  const { id } = await crearInstitucion(db, INSTITUCION_POR_DEFECTO, now);
  return { accion: 'creada', id };
}
