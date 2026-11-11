/** Ayuda al usuario antes de enviar; el backend sigue siendo la autoridad (plan §9.1). */

const NOMBRE_MAX = 120;
const CORREO_MAX = 254;
/** `RAW_EMAIL_PATTERN` de `apps/backend/src/auth/dto/register.dto.ts`. */
const CORREO_PATTERN = /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const PASSWORD_POLICY = `Entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres. Puedes pegarla o usar tu gestor de contraseñas.`;

export function validateNombre(value: string): string | undefined {
  if (!/\S/.test(value)) return 'Escribe tu nombre.';
  if (value.length > NOMBRE_MAX) return `Usa como máximo ${NOMBRE_MAX} caracteres.`;
  return undefined;
}

export function validateCorreo(value: string): string | undefined {
  if (!/\S/.test(value)) return 'Escribe tu correo.';
  if (value.length > CORREO_MAX || !CORREO_PATTERN.test(value)) {
    return 'Revisa el correo. Debe tener la forma nombre@dominio.com.';
  }
  return undefined;
}

/** En el inicio de sesión no se valida el formato, igual que `LoginDto`: el rechazo es siempre el genérico. */
export function validateLoginCorreo(value: string): string | undefined {
  if (!/\S/.test(value)) return 'Escribe tu correo.';
  if (value.length > 320) return 'Revisa el correo: es demasiado largo.';
  return undefined;
}

export function validateLoginPassword(value: string): string | undefined {
  if (value === '') return 'Escribe tu contraseña.';
  if (value.length > 1024) return 'Revisa la contraseña: es demasiado larga.';
  return undefined;
}

/** Cuenta puntos de código, sin recortar espacios, igual que `password-policy.ts` (RNF-02). */
export function validateNewPassword(value: string): string | undefined {
  const length = Array.from(value).length;
  if (length === 0) return `Escribe una contraseña de entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`;
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) {
    return `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres; ahora tiene ${length}.`;
  }
  return undefined;
}
