import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { testEnv } from '../../test/support/test-env';
import { LinkBuilder } from '../mail/link-builder';
import { ConfigValidationError, loadAuthConfig, RATE_LIMIT_KEYS } from './auth-config';
import { parseDuration, parseRateLimitRule } from './duration';

const base = () => testEnv({ MONGODB_URI: 'mongodb://h/db', REDIS_URL: 'redis://h:6379' });

function problemsOf(overrides: Record<string, string | undefined>): string[] {
  try {
    loadAuthConfig({ ...base(), ...overrides });
    return [];
  } catch (error) {
    if (error instanceof ConfigValidationError) return [...error.problems];
    throw error;
  }
}

// T-11 (RN-13, RNF-04, RNF-06, CA-14) y la validación de Mailpit de DEC-05.
describe('configuración de autenticación (T-11)', () => {
  it('carga una configuración completa y lee los valores (no hay literales en los servicios)', () => {
    const config = loadAuthConfig(base());
    expect(config.ttl.verifyTokenMs).toBe(24 * 3_600_000);
    expect(config.ttl.resetTokenMs).toBe(30 * 60_000);
    expect(config.rateLimits.LOGIN_IP_FAILURE).toEqual({ max: 60, windowMs: 15 * 60_000 });
    expect(config.authAllowedOrigins).toEqual(['http://localhost:5173']);
  });

  it('parsea duraciones y reglas y rechaza formatos inválidos o no positivos', () => {
    expect(parseDuration('7d')).toBe(7 * 86_400_000);
    expect(parseDuration('500ms')).toBe(500);
    for (const bad of ['0m', '15', 'm', '-1h', '1.5h', '']) expect(parseDuration(bad)).toBeNull();
    expect(parseRateLimitRule('5/15m')).toEqual({ max: 5, windowMs: 900_000 });
    for (const bad of ['0/15m', '5', '5/0m', 'x/1h', '5/15m/1']) expect(parseRateLimitRule(bad)).toBeNull();
  });

  it.each([
    'JWT_ACCESS_TTL',
    'SESSION_REFRESH_TTL',
    'VERIFY_TOKEN_TTL',
    'RESET_TOKEN_TTL',
    'ACTIVATION_TOKEN_TTL',
    ...RATE_LIMIT_KEYS.map((k) => `RATE_LIMIT_${k}`),
    'TRUST_PROXY_HOPS',
    'AUTH_ALLOWED_ORIGINS',
    'APP_PUBLIC_URL',
  ])('el arranque falla si falta %s', (name) => {
    expect(problemsOf({ [name]: undefined }).join(' ')).toContain(name);
  });

  it.each([
    ['VERIFY_TOKEN_TTL', '24'],
    ['RESET_TOKEN_TTL', '0m'],
    ['RATE_LIMIT_LOGIN_IP_FAILURE', '0/15m'],
    ['RATE_LIMIT_REGISTER_IP', 'veinte/1h'],
    ['SESSION_MAX_ROTATIONS', '0'],
  ])('el arranque falla si %s tiene formato inválido o no positivo (%s)', (name, value) => {
    expect(problemsOf({ [name]: value }).join(' ')).toContain(name);
  });

  it.each([
    ['*', 'comodín'],
    ['null', 'null'],
    ['http://localhost:5173/app', 'ruta'],
    ['ftp://localhost:5173', 'esquema'],
    ['http://otro.example.test', 'sin el origen de APP_PUBLIC_URL'],
  ])('DEC-20: AUTH_ALLOWED_ORIGINS=%s (%s) → el arranque falla', (value) => {
    expect(problemsOf({ AUTH_ALLOWED_ORIGINS: value }).join(' ')).toContain('AUTH_ALLOWED_ORIGINS');
  });

  it('DEC-20 y RN-13: fuera de local exige https en APP_PUBLIC_URL y en los orígenes', () => {
    const problems = problemsOf({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.test' }).join(' ');
    expect(problems).toContain('APP_PUBLIC_URL');
    expect(problems).toContain('AUTH_ALLOWED_ORIGINS');
  });

  it('RN-13: un APP_PUBLIC_URL fuera de la lista permitida o con ruta → el arranque falla', () => {
    expect(problemsOf({ APP_PUBLIC_URL: 'http://malicioso.example.test' }).join(' ')).toContain('AUTH_ALLOWED_ORIGINS');
    expect(problemsOf({ APP_PUBLIC_URL: 'http://localhost:5173/x' }).join(' ')).toContain('APP_PUBLIC_URL');
  });

  it('DEC-05: NODE_ENV=production con SMTP_HOST=mailpit → el arranque falla', () => {
    expect(problemsOf({ NODE_ENV: 'production', SMTP_HOST: 'mailpit' }).join(' ')).toContain('SMTP_HOST');
  });

  it('DEC-16/DEC-17: CAPTCHA de prueba fuera de local y ARGON2_MAX_CONCURRENCY > UV_THREADPOOL_SIZE → fallan', () => {
    expect(problemsOf({ NODE_ENV: 'production' }).join(' ')).toContain('CAPTCHA_PROVIDER');
    expect(problemsOf({ ARGON2_MAX_CONCURRENCY: '8', UV_THREADPOOL_SIZE: '4' }).join(' ')).toContain('ARGON2_MAX_CONCURRENCY');
  });

  it('los mensajes de error nombran la variable pero nunca su valor', () => {
    const secret = 'x'.repeat(10);
    expect(problemsOf({ JWT_ACCESS_SECRET: secret }).join(' ')).not.toContain(secret);
  });

  it('RN-13: LinkBuilder solo usa APP_PUBLIC_URL (un Host malicioso no influye) y pone el token en el fragmento', () => {
    const links = new LinkBuilder({ appPublicUrl: 'http://localhost:5173' });
    const link = links.build('verificarCorreo', 'abc_DEF-123');
    expect(link).toBe('http://localhost:5173/verificar-correo#token=abc_DEF-123');
    expect(new URL(link).search).toBe('');
    // La API no recibe ninguna cabecera: no hay forma de que `Host`/`X-Forwarded-Host` lleguen al enlace.
    expect(LinkBuilder.prototype.build.length).toBe(2);
  });

  it('RNF-04: ningún servicio contiene vencimientos ni umbrales literales del plan', () => {
    const literals = /\b(15m|24h|30m|7d|60\/15m|5\/15m|3\/1h|20\/1h|30\/1h|10\/15m|30\/15m)\b/;
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) files.push(path);
      }
    };
    walk(join(__dirname, '..'));
    // Se ignoran los comentarios (ejemplos de formato en la documentación del parser).
    const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const offenders = files.filter((f) => literals.test(code(f)));
    expect(offenders).toEqual([]);
  });
});
