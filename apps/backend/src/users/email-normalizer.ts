/** RN-03: normaliza el correo antes de guardarlo y de buscarlo (trim + NFC + minúsculas). */
export function normalizeEmail(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase();
}

/** Forma mínima de un correo; la validación fuerte la hace el DTO (DT-01). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
