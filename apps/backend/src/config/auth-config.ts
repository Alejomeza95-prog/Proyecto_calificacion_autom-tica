import { parseDuration, parseRateLimitRule, type RateLimitRule } from './duration';

/**
 * Configuración de autenticación (plan HT-AUTH-01 §9.4, T-11).
 * Ningún vencimiento ni umbral vive en el código: todo se lee de variables de entorno y
 * se valida al arrancar. Si falta algo o tiene formato inválido, el arranque falla (RNF-04).
 * Los mensajes de error nombran la variable, nunca su valor (no se filtran secretos).
 */

/** Operaciones y dimensiones de DEC-15 y DEC-17. Variable: `RATE_LIMIT_<clave>`. */
export const RATE_LIMIT_KEYS = [
  'LOGIN_IP_FAILURE',
  'LOGIN_CHALLENGE_IP',
  'LOGIN_CHALLENGE_ACCOUNT',
  'REGISTER_EMAIL',
  'REGISTER_IP',
  'RESEND_ACCOUNT',
  'RESEND_IP',
  'VERIFY_TOKEN',
  'VERIFY_IP',
  'FORGOT_ACCOUNT',
  'FORGOT_IP',
  'RESET_TOKEN',
  'RESET_IP',
  'ACTIVATE_TOKEN',
  'ACTIVATE_IP',
  'AUTH_GLOBAL',
] as const;
export type RateLimitKey = (typeof RATE_LIMIT_KEYS)[number];

export const CAPTCHA_PROVIDERS = ['test'] as const;
export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number];

export interface AuthConfig {
  readonly nodeEnv: string;
  readonly isLocal: boolean;
  readonly mongodbUri: string;
  readonly redisUrl: string;
  readonly appPublicUrl: string;
  readonly authAllowedOrigins: readonly string[];
  readonly jwtAccessSecret: string;
  readonly ttl: {
    readonly jwtAccessMs: number;
    readonly sessionRefreshMs: number;
    readonly verifyTokenMs: number;
    readonly resetTokenMs: number;
    readonly activationTokenMs: number;
  };
  readonly authMinResponseMs: number;
  readonly rateLimits: Readonly<Record<RateLimitKey, RateLimitRule>>;
  readonly rateLimitKeyPepper: string;
  readonly rateLimitRedisTimeoutMs: number;
  readonly trustProxyHops: number;
  readonly sessionMaxRotations: number;
  readonly authOverloadRetryAfterS: number;
  readonly argon2: {
    readonly maxConcurrency: number;
    readonly queueMax: number;
    readonly queueTimeoutMs: number;
    readonly uvThreadpoolSize: number;
  };
  readonly captcha: {
    readonly provider: CaptchaProvider;
    readonly verifyTimeoutMs: number;
  };
  readonly smtp: {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
    readonly user: string | undefined;
    readonly password: string | undefined;
  };
  readonly mailFrom: string;
  readonly mailDrainTimeoutMs: number;
  readonly auditIpPepper: string;
}

export class ConfigValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuración de autenticación inválida:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigValidationError';
  }
}

type Env = Readonly<Record<string, string | undefined>>;

const LOCAL_ENVS = new Set(['development', 'test']);
const MIN_SECRET_LENGTH = 32;
/** Hosts de captura local que nunca deben usarse en producción (DEC-05). */
const LOCAL_SMTP_HOSTS = new Set(['mailpit', 'localhost', '127.0.0.1', '::1']);

class EnvReader {
  readonly problems: string[] = [];
  constructor(private readonly env: Env) {}

  string(name: string): string {
    const value = this.env[name]?.trim();
    if (!value) {
      this.problems.push(`${name}: obligatoria`);
      return '';
    }
    return value;
  }

  optionalString(name: string): string | undefined {
    const value = this.env[name]?.trim();
    return value ? value : undefined;
  }

  secret(name: string): string {
    const value = this.string(name);
    if (value && value.length < MIN_SECRET_LENGTH) {
      this.problems.push(`${name}: debe tener al menos ${MIN_SECRET_LENGTH} caracteres`);
    }
    return value;
  }

  duration(name: string): number {
    const raw = this.string(name);
    if (!raw) return 0;
    const ms = parseDuration(raw);
    if (ms === null) {
      this.problems.push(`${name}: formato <entero><ms|s|m|h|d> positivo`);
      return 0;
    }
    return ms;
  }

  integer(name: string, min: number, fallback?: number): number {
    const raw = this.env[name]?.trim();
    if (!raw) {
      if (fallback !== undefined) return fallback;
      this.problems.push(`${name}: obligatoria`);
      return 0;
    }
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min) {
      this.problems.push(`${name}: entero >= ${min}`);
      return 0;
    }
    return Number(raw);
  }

  boolean(name: string): boolean {
    const raw = this.string(name);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw) this.problems.push(`${name}: true o false`);
    return false;
  }

  rateLimit(key: RateLimitKey): RateLimitRule {
    const name = `RATE_LIMIT_${key}`;
    const raw = this.string(name);
    if (!raw) return { max: 0, windowMs: 0 };
    const rule = parseRateLimitRule(raw);
    if (!rule) {
      this.problems.push(`${name}: formato <máximo>/<ventana> con valores positivos`);
      return { max: 0, windowMs: 0 };
    }
    return rule;
  }
}

/**
 * Valida un origen completo `http(s)://host[:puerto]` sin ruta, sin comodines y sin `null` (DEC-20).
 * Devuelve el origen normalizado o `null` si no es válido.
 */
export function normalizeOrigin(raw: string, requireHttps: boolean): string | null {
  const value = raw.trim();
  if (!value || value === 'null' || value.includes('*')) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (requireHttps && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  // Sin ruta: solo se admite la raíz (con o sin barra final en el valor escrito).
  if (url.pathname !== '/' || /^[a-z]+:\/\/[^/]+\/./i.test(value)) return null;
  return url.origin;
}

export function loadAuthConfig(env: Env): AuthConfig {
  const r = new EnvReader(env);
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const isLocal = LOCAL_ENVS.has(nodeEnv);

  const mongodbUri = r.string('MONGODB_URI');
  const redisUrl = r.string('REDIS_URL');

  // APP_PUBLIC_URL y AUTH_ALLOWED_ORIGINS (RN-13, DEC-20).
  const appPublicUrlRaw = r.string('APP_PUBLIC_URL');
  let appPublicUrl = '';
  if (appPublicUrlRaw) {
    const origin = normalizeOrigin(appPublicUrlRaw, !isLocal);
    if (!origin) {
      r.problems.push(`APP_PUBLIC_URL: origen http(s) sin ruta${isLocal ? '' : ' y con https fuera de local'}`);
    } else {
      appPublicUrl = origin;
    }
  }
  const originsRaw = r.string('AUTH_ALLOWED_ORIGINS');
  const authAllowedOrigins: string[] = [];
  if (originsRaw) {
    for (const entry of originsRaw.split(',')) {
      const origin = normalizeOrigin(entry, !isLocal);
      if (!origin) {
        r.problems.push(
          'AUTH_ALLOWED_ORIGINS: cada entrada debe ser un origen completo http(s)://host[:puerto], sin ruta, sin * y sin null' +
            (isLocal ? '' : ', con https fuera de local'),
        );
        break;
      }
      if (!authAllowedOrigins.includes(origin)) authAllowedOrigins.push(origin);
    }
    if (appPublicUrl && !authAllowedOrigins.includes(appPublicUrl)) {
      r.problems.push('AUTH_ALLOWED_ORIGINS: debe incluir el origen de APP_PUBLIC_URL (lista permitida, RN-13)');
    }
  }

  const ttl = {
    jwtAccessMs: r.duration('JWT_ACCESS_TTL'),
    sessionRefreshMs: r.duration('SESSION_REFRESH_TTL'),
    verifyTokenMs: r.duration('VERIFY_TOKEN_TTL'),
    resetTokenMs: r.duration('RESET_TOKEN_TTL'),
    activationTokenMs: r.duration('ACTIVATION_TOKEN_TTL'),
  };

  const rateLimits = Object.fromEntries(RATE_LIMIT_KEYS.map((key) => [key, r.rateLimit(key)])) as Record<
    RateLimitKey,
    RateLimitRule
  >;

  const argon2 = {
    maxConcurrency: r.integer('ARGON2_MAX_CONCURRENCY', 1),
    queueMax: r.integer('ARGON2_QUEUE_MAX', 0),
    queueTimeoutMs: r.integer('ARGON2_QUEUE_TIMEOUT_MS', 1),
    // libuv usa 4 hilos si la variable no está definida.
    uvThreadpoolSize: r.integer('UV_THREADPOOL_SIZE', 1, 4),
  };
  if (argon2.maxConcurrency > argon2.uvThreadpoolSize) {
    r.problems.push('ARGON2_MAX_CONCURRENCY: no puede superar UV_THREADPOOL_SIZE (DEC-17)');
  }

  const captchaProviderRaw = r.string('CAPTCHA_PROVIDER');
  const captchaProvider = CAPTCHA_PROVIDERS.find((p) => p === captchaProviderRaw);
  if (captchaProviderRaw && !captchaProvider) {
    r.problems.push(`CAPTCHA_PROVIDER: valores admitidos ${CAPTCHA_PROVIDERS.join(', ')} (proveedor real pendiente, DEC-16)`);
  }
  if (captchaProvider === 'test' && !isLocal) {
    r.problems.push('CAPTCHA_PROVIDER: el adaptador de prueba no se admite fuera de local (DEC-16)');
  }

  const smtpHost = r.string('SMTP_HOST');
  if (nodeEnv === 'production' && LOCAL_SMTP_HOSTS.has(smtpHost.toLowerCase())) {
    r.problems.push('SMTP_HOST: Mailpit o localhost no se admiten con NODE_ENV=production (DEC-05)');
  }

  const config: AuthConfig = {
    nodeEnv,
    isLocal,
    mongodbUri,
    redisUrl,
    appPublicUrl,
    authAllowedOrigins,
    jwtAccessSecret: r.secret('JWT_ACCESS_SECRET'),
    ttl,
    authMinResponseMs: r.integer('AUTH_MIN_RESPONSE_MS', 1),
    rateLimits,
    rateLimitKeyPepper: r.secret('RATE_LIMIT_KEY_PEPPER'),
    rateLimitRedisTimeoutMs: r.integer('RATE_LIMIT_REDIS_TIMEOUT_MS', 1),
    trustProxyHops: r.integer('TRUST_PROXY_HOPS', 0),
    sessionMaxRotations: r.integer('SESSION_MAX_ROTATIONS', 1),
    authOverloadRetryAfterS: r.integer('AUTH_OVERLOAD_RETRY_AFTER_S', 1),
    argon2,
    captcha: {
      provider: captchaProvider ?? 'test',
      verifyTimeoutMs: r.integer('CAPTCHA_VERIFY_TIMEOUT_MS', 1),
    },
    smtp: {
      host: smtpHost,
      port: r.integer('SMTP_PORT', 1),
      secure: r.boolean('SMTP_SECURE'),
      user: r.optionalString('SMTP_USER'),
      password: r.optionalString('SMTP_PASSWORD'),
    },
    mailFrom: r.string('MAIL_FROM'),
    mailDrainTimeoutMs: r.integer('MAIL_DRAIN_TIMEOUT_MS', 1),
    auditIpPepper: r.secret('AUDIT_IP_PEPPER'),
  };

  if (r.problems.length > 0) throw new ConfigValidationError(r.problems);
  return config;
}
