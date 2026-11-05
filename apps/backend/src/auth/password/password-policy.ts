/**
 * Política de contraseñas (plan §11, RNF-02, CA-03): longitud de 12 a 128 caracteres,
 * sin reglas de composición. Se cuentan puntos de código (una emoji cuenta como 1).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'DEMASIADO_CORTA' | 'DEMASIADO_LARGA' };

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) return { ok: false, reason: 'DEMASIADO_CORTA' };
  if (length > PASSWORD_MAX_LENGTH) return { ok: false, reason: 'DEMASIADO_LARGA' };
  return { ok: true };
}
