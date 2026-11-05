/**
 * Redacción de secretos para logs (plan §11, T-10, RN-12). Enmascara por nombre de clave
 * (`password`, `token`, `cookie`, `authorization`, `correo`/`email`, `*_hash`) y, en textos libres,
 * por patrón (credenciales en URI, pares `clave=valor` sensibles, `Bearer`, correos, hashes SHA-256,
 * hashes Argon2, tokens Base64URL de 43 caracteres, JWT y enlaces con `#token=`).
 * Las credenciales de una URI se enmascaran conservando el esquema, el host y el puerto, que sirven
 * para diagnosticar (`mongodb://[REDACTADO]@mongo:27017/omr`).
 */
export const REDACTED = '[REDACTADO]';

const SENSITIVE_KEY = /(pass(word)?|token|cookie|authorization|correo|email|secret|_hash$|^hash$|hashes)/i;

/** Reemplazos que conservan parte del texto (prefijo útil para el diagnóstico). */
const PRESERVING_PATTERNS: readonly (readonly [RegExp, string])[] = [
  // Credenciales en URI (`esquema://usuario:clave@host`, también solo `usuario@`): se conserva esquema y host.
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]+@/gi, `$1${REDACTED}@`],
  // Credenciales HTTP en texto libre (antes que los pares clave=valor: `authorization: Bearer x`).
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // Pares clave=valor o clave: valor con nombre sensible en texto libre (query strings, mensajes).
  [
    /\b((?:pass(?:word|wd)?|pwd|secret|client_secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"']+)/gi,
    `$1${REDACTED}`,
  ],
];

const TEXT_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z0-9+.-]*:\/\/[^\s#]*#token=[A-Za-z0-9_-]+/gi, // enlaces con token en el fragmento
  /\$argon2(id|i|d)\$[^\s"']+/g, // hashes Argon2
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
  /\b[0-9a-f]{64}\b/gi, // SHA-256 hex
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, // token Base64URL de 256 bits
  /[^\s@"'<>/:[\]]+@[^\s@"'<>]+\.[^\s@"'<>]+/g, // correos (no toca el `[REDACTADO]@host` de una URI)
];

export function redactText(text: string): string {
  const preserved = PRESERVING_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
  return TEXT_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, REDACTED), preserved);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message), ...(value.stack ? { stack: redactText(value.stack) } : {}) };
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
