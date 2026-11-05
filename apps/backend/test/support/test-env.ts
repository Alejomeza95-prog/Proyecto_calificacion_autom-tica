import { randomBytes } from 'node:crypto';

/**
 * Configuración de prueba completa y válida (sin secretos reales: valores aleatorios por ejecución).
 * MONGODB_URI y REDIS_URL se toman del entorno local; el resto se fija aquí con valores de prueba.
 * Los valores de límites replican los propuestos en DEC-15 para que las pruebas los lean de la
 * configuración y no de constantes (T-40).
 */
export function testEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    MONGODB_URI: process.env.MONGODB_URI,
    REDIS_URL: process.env.REDIS_URL,
    APP_PUBLIC_URL: 'http://localhost:5173',
    AUTH_ALLOWED_ORIGINS: 'http://localhost:5173',
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    JWT_ACCESS_TTL: '15m',
    SESSION_REFRESH_TTL: '7d',
    VERIFY_TOKEN_TTL: '24h',
    RESET_TOKEN_TTL: '30m',
    ACTIVATION_TOKEN_TTL: '24h',
    AUTH_MIN_RESPONSE_MS: '50',
    RATE_LIMIT_LOGIN_IP_FAILURE: '60/15m',
    RATE_LIMIT_LOGIN_CHALLENGE_IP: '60/15m',
    RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT: '5/15m',
    RATE_LIMIT_REGISTER_EMAIL: '3/1h',
    RATE_LIMIT_REGISTER_IP: '20/1h',
    RATE_LIMIT_RESEND_ACCOUNT: '3/1h',
    RATE_LIMIT_RESEND_IP: '30/1h',
    RATE_LIMIT_VERIFY_TOKEN: '10/15m',
    RATE_LIMIT_VERIFY_IP: '30/15m',
    RATE_LIMIT_FORGOT_ACCOUNT: '3/1h',
    RATE_LIMIT_FORGOT_IP: '30/1h',
    RATE_LIMIT_RESET_TOKEN: '5/15m',
    RATE_LIMIT_RESET_IP: '30/15m',
    RATE_LIMIT_ACTIVATE_TOKEN: '5/15m',
    RATE_LIMIT_ACTIVATE_IP: '30/15m',
    RATE_LIMIT_AUTH_GLOBAL: '10000/1m',
    RATE_LIMIT_KEY_PEPPER: randomBytes(32).toString('hex'),
    // Holgado para pruebas bajo carga (--detectOpenHandles, ráfagas concurrentes); el fallo cerrado no depende
    // de este valor porque el cliente no encola comandos sin conexión (enableOfflineQueue: false).
    RATE_LIMIT_REDIS_TIMEOUT_MS: '5000',
    TRUST_PROXY_HOPS: '0',
    SESSION_MAX_ROTATIONS: '1000',
    AUTH_OVERLOAD_RETRY_AFTER_S: '5',
    ARGON2_MAX_CONCURRENCY: '2',
    ARGON2_QUEUE_MAX: '8',
    ARGON2_QUEUE_TIMEOUT_MS: '5000',
    UV_THREADPOOL_SIZE: '4',
    CAPTCHA_PROVIDER: 'test',
    CAPTCHA_VERIFY_TIMEOUT_MS: '200',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    SMTP_CONNECTION_TIMEOUT_MS: '2000',
    SMTP_GREETING_TIMEOUT_MS: '2000',
    SMTP_SOCKET_TIMEOUT_MS: '5000',
    MAIL_FROM: 'no-responder@example.test',
    MAIL_DRAIN_TIMEOUT_MS: '2000',
    METRICS_PORT: '0',
    METRICS_HOST: '127.0.0.1',
    AUDIT_IP_PEPPER: randomBytes(32).toString('hex'),
    ...overrides,
  };
}
