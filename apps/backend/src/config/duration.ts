/** Unidades aceptadas en las variables de duración (`15m`, `24h`, `7d`, `500ms`). */
const UNIT_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

/** Convierte `<entero><unidad>` a milisegundos. Devuelve `null` si el formato no es válido o no es positivo. */
export function parseDuration(raw: string): number | null {
  const match = DURATION_PATTERN.exec(raw.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_MS;
  const ms = amount * UNIT_MS[unit];
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

export interface RateLimitRule {
  readonly max: number;
  readonly windowMs: number;
}

/** Convierte `<máximo>/<ventana>` (p. ej. `60/15m`) en una regla. `null` si no es válido o no es positivo. */
export function parseRateLimitRule(raw: string): RateLimitRule | null {
  const parts = raw.trim().split('/');
  if (parts.length !== 2) return null;
  const [maxRaw, windowRaw] = parts as [string, string];
  if (!/^\d+$/.test(maxRaw)) return null;
  const max = Number(maxRaw);
  const windowMs = parseDuration(windowRaw);
  if (!Number.isSafeInteger(max) || max <= 0 || windowMs === null) return null;
  return { max, windowMs };
}
