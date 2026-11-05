import type { Schema } from 'mongoose';

/**
 * Elimina campos secretos de `toJSON` y `toObject` (plan §11, protección de hashes).
 * Complementa `select: false`: aunque una consulta los pida de forma explícita, nunca se serializan.
 */
export function hideSecretFields(schema: Schema, fields: readonly string[]): void {
  const transform = (_doc: unknown, ret: Record<string, unknown>): Record<string, unknown> => {
    for (const field of fields) delete ret[field];
    return ret;
  };
  schema.set('toJSON', { transform });
  schema.set('toObject', { transform });
}
