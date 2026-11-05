import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAuthConfig, RATE_LIMIT_KEYS } from './auth-config';

const ROOT = join(__dirname, '..', '..', '..', '..');
const TEMPLATE = readFileSync(join(ROOT, '.env.docker.example'), 'utf8');
const DOC = readFileSync(join(ROOT, 'docs', 'onboarding', '02-variables-entorno.md'), 'utf8');

function parseTemplate(text: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) vars.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return vars;
}

/** Variables de la sección de autenticación del documento; `X` / `_IP` se expande a `X` y `<prefijo>_IP`. */
function documentedAuthVars(doc: string): Set<string> {
  const start = doc.indexOf('## Autenticación (HT-AUTH-01');
  const end = doc.indexOf('\n## ', start + 1);
  const section = doc.slice(start, end);
  const names = new Set<string>();
  for (const row of section.split(/\r?\n/).filter((l) => l.startsWith('| `'))) {
    const firstCell = row.split('|')[1] ?? '';
    let previous = '';
    for (const [, name] of firstCell.matchAll(/`([A-Z0-9_]+)`/g)) {
      if (!name) continue;
      const full = name.startsWith('_') ? `${previous.slice(0, previous.lastIndexOf('_'))}${name}` : name;
      names.add(full);
      previous = full;
    }
  }
  return names;
}

const AUTH_BLOCK_START = '# --- Autenticación (HT-AUTH-01';

// T-14 (RNF-04, RN-13): plantilla y documentación de las variables de plan §9.4.
describe('plantilla .env.docker.example y documentación (T-14)', () => {
  const vars = parseTemplate(TEMPLATE);
  const authVars = new Set(parseTemplate(TEMPLATE.slice(TEMPLATE.indexOf(AUTH_BLOCK_START))).keys());

  it('con solo la plantilla, la configuración de autenticación se valida y arranca en local', () => {
    expect(() => loadAuthConfig(Object.fromEntries(vars))).not.toThrow();
  });

  it('incluye todas las variables de §9.4 exigidas por T-14', () => {
    const required = [
      ...RATE_LIMIT_KEYS.map((k) => `RATE_LIMIT_${k}`),
      'RATE_LIMIT_KEY_PEPPER',
      'RATE_LIMIT_REDIS_TIMEOUT_MS',
      'TRUST_PROXY_HOPS',
      'SESSION_MAX_ROTATIONS',
      'CAPTCHA_PROVIDER',
      'CAPTCHA_SITE_KEY',
      'CAPTCHA_SECRET',
      'CAPTCHA_VERIFY_TIMEOUT_MS',
      'ARGON2_MAX_CONCURRENCY',
      'ARGON2_QUEUE_MAX',
      'ARGON2_QUEUE_TIMEOUT_MS',
      'UV_THREADPOOL_SIZE',
      'AUTH_OVERLOAD_RETRY_AFTER_S',
      'SMTP_SECURE',
      'MAIL_DRAIN_TIMEOUT_MS',
      'AUTH_ALLOWED_ORIGINS',
      'APP_PUBLIC_URL',
      'JWT_ACCESS_SECRET',
      'AUDIT_IP_PEPPER',
    ];
    expect(required.filter((k) => !vars.has(k))).toEqual([]);
  });

  it('claves documentadas = claves de la plantilla (sección de autenticación)', () => {
    expect([...documentedAuthVars(DOC)].sort()).toEqual([...authVars].sort());
  });

  it('ningún valor real ni secreto: los secretos son marcadores o están vacíos', () => {
    for (const key of ['JWT_ACCESS_SECRET', 'RATE_LIMIT_KEY_PEPPER', 'AUDIT_IP_PEPPER', 'SEED_DEV_PASSWORD']) {
      expect(vars.get(key)).toMatch(/^cambiar_/);
    }
    for (const key of ['CAPTCHA_SECRET', 'SMTP_USER', 'SMTP_PASSWORD']) expect(vars.get(key)).toBe('');
  });

  it('los valores de DEC-17 están marcados como solo locales y no validados', () => {
    const dec17 = TEMPLATE.slice(TEMPLATE.indexOf('# Protección de recursos (DEC-17)'));
    expect(dec17).toMatch(/SOLO LOCAL, NO VALIDADOS/);
    expect(dec17.indexOf('RATE_LIMIT_AUTH_GLOBAL')).toBeGreaterThan(0);
  });
});
