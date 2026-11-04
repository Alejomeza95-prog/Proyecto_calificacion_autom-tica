/**
 * Redacción de secretos para logs (plan §11, T-10, RN-12). Enmascara por nombre de clave
 * (`password`, `token`, `cookie`, `authorization`, `correo`/`email`, `*_hash`) y, en textos libres,
 * por patrón (correos, hashes SHA-256, hashes Argon2, tokens Base64URL de 43 caracteres, JWT y
 * enlaces con `#token=`).
 */
export const REDACTED = '[REDACTADO]';

const SENSITIVE_KEY = /(pass(word)?|token|cookie|authorization|correo|email|secret|_hash$|^hash$|hashes)/i;

const TEXT_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\/[^\s#]*#token=[A-Za-z0-9_-]+/gi, // enlaces con token en el fragmento
  /\$argon2(id|i|d)\$[^\s"']+/g, // hashes Argon2
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
  /\b[0-9a-f]{64}\b/gi, // SHA-256 hex
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, // token Base64URL de 256 bits
  /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, // correos
];

export function redactText(text: string): string {
  return TEXT_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, REDACTED), text);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
