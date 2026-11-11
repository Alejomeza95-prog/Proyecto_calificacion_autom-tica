import { MAX_PREGUNTAS, MIN_PREGUNTAS, OPCIONES_CLAVE, type RespuestaClave } from './answer-keys-api.ts';

/** Copia de `apps/backend/src/answer-keys/answer-key.rules.ts` (HT-AUTH-03 RN-08, RN-10). */

/** Ajusta la grilla a `n` preguntas: conserva las existentes, recorta las sobrantes y agrega vacías. */
export function resize(respuestas: readonly RespuestaClave[], n: number): RespuestaClave[] {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('n debe ser un entero no negativo');
  const result = respuestas.slice(0, n);
  while (result.length < n) result.push(null);
  return result;
}

/** Preguntas (desde 1) sin respuesta. */
export function missingQuestions(respuestas: readonly RespuestaClave[]): number[] {
  const missing: number[] = [];
  respuestas.forEach((r, i) => {
    if (r === null || !(OPCIONES_CLAVE as readonly string[]).includes(r)) missing.push(i + 1);
  });
  return missing;
}

/** Preguntas con respuesta que se perderían al reducir la grilla a `n`. */
export function answeredBeyond(respuestas: readonly RespuestaClave[], n: number): number[] {
  const lost: number[] = [];
  for (let i = n; i < respuestas.length; i += 1) if (respuestas[i] !== null) lost.push(i + 1);
  return lost;
}

/** Cantidad válida de preguntas (entero entre 1 y 100), o `null`. */
export function parseQuestionCount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= MIN_PREGUNTAS && n <= MAX_PREGUNTAS ? n : null;
}

/** Lista legible «2, 5 y 7». */
export function joinNumbers(numbers: readonly number[]): string {
  if (numbers.length <= 1) return numbers.join('');
  return `${numbers.slice(0, -1).join(', ')} y ${numbers[numbers.length - 1]}`;
}
