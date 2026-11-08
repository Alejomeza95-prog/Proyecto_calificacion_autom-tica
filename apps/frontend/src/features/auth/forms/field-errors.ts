import type { ApiError } from '../api/problem.ts';

/**
 * Pasa un problema del backend a errores por campo, usando textos propios porque `reglas` son nombres
 * internos (plan §9.1). `null` si el problema no se puede mostrar junto a un campo de este formulario.
 */
export function fieldErrorsFromProblem(
  error: ApiError,
  messages: Readonly<Record<string, string>>,
): Record<string, string> | null {
  const fields = error.kind === 'politica-password' ? ['password'] : error.kind === 'solicitud-invalida' ? error.fields : [];
  const entries = fields.flatMap((field) => {
    const message = messages[field];
    return message === undefined ? [] : [[field, message] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}
