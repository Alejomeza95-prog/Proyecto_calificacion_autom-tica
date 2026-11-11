import { OPCIONES_CLAVE, type RespuestaClave } from './answer-key.constants';

/**
 * Reglas puras de la clave (HT-AUTH-03 plan §2.3, RN-08, RN-10). Sin dependencias de Nest ni Mongoose,
 * para reutilizarlas en el servicio, el esquema y las pruebas unitarias.
 */

/** Ajusta el arreglo a `n` preguntas: conserva las existentes, recorta las sobrantes y agrega vacías. */
export function resize(respuestas: readonly RespuestaClave[], n: number): RespuestaClave[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n debe ser un entero no negativo');
  const result = respuestas.slice(0, n);
  while (result.length < n) result.push(null);
  return result;
}

/** Números de pregunta (desde 1) sin respuesta válida. */
export function missingQuestions(respuestas: readonly RespuestaClave[]): number[] {
  const missing: number[] = [];
  respuestas.forEach((r, i) => {
    if (r === null || !(OPCIONES_CLAVE as readonly string[]).includes(r)) missing.push(i + 1);
  });
  return missing;
}

/** Completa cuando tiene al menos una pregunta y todas tienen una opción A–D (requisito para publicar). */
export function isComplete(respuestas: readonly RespuestaClave[]): boolean {
  return respuestas.length > 0 && missingQuestions(respuestas).length === 0;
}
