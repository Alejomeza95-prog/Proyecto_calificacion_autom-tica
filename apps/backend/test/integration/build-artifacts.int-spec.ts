import { execSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND = resolve(__dirname, '..', '..');
const DIST_MIGRATIONS = resolve(BACKEND, 'dist', 'migrations');
const MIGRATE = resolve(BACKEND, 'dist', 'cli', 'migrate.js');
/** Puerto cerrado: si el comando intentara conectar, no llegaría a ninguna base (ni de desarrollo ni de prueba). */
const UNREACHABLE_URI = 'mongodb://127.0.0.1:1/omr_test_sin_conexion';

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly ms: number;
}

/** Ejecuta `node dist/cli/migrate.js status` con un entorno mínimo y controlado (sin `.env`). */
function migrateStatus(nodeEnv: string | undefined): Promise<Run> {
  const env: Record<string, string> = { MONGODB_URI: UNREACHABLE_URI };
  for (const name of ['PATH', 'SystemRoot']) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
  const started = Date.now();
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [MIGRATE, 'status'], { cwd: BACKEND, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', fail);
    child.on('close', (code) => done({ code, stdout, stderr, ms: Date.now() - started }));
  });
}

/**
 * Artefactos compilados (`pnpm build`), sin bases de datos:
 * - T-50 (DEC-30, opción B): las migraciones compiladas, sobre las que el runner calcula el checksum,
 *   usan LF y no contienen CR en ningún sistema operativo.
 * - T-48 (DEC-28): el comando compilado `migrate:*` sin `NODE_ENV` termina con código 2 **antes** de
 *   conectar a MongoDB (la URI apunta a un puerto cerrado; no se ejecuta ninguna migración).
 */
describe('artefactos compilados (T-50, T-48)', () => {
  beforeAll(() => {
    execSync('corepack pnpm -s build', { cwd: BACKEND, stdio: 'ignore' });
  }, 240_000);

  it('T-50/DEC-30: tsconfig.migrations.json declara newLine lf', () => {
    const config = JSON.parse(readFileSync(resolve(BACKEND, 'tsconfig.migrations.json'), 'utf8')) as {
      compilerOptions?: { newLine?: string };
    };
    expect(config.compilerOptions?.newLine).toBe('lf');
  });

  it('T-50/DEC-30: dist/migrations/*.js usa LF y no contiene ningún CR', () => {
    const files = readdirSync(DIST_MIGRATIONS).filter((f) => f.endsWith('.js'));
    expect(files).toEqual(expect.arrayContaining(['001-auth-indices.js', '002-seed-roles-dev.js']));
    for (const file of files) {
      const bytes = readFileSync(resolve(DIST_MIGRATIONS, file));
      expect({ file, cr: bytes.filter((b) => b === 0x0d).length }).toEqual({ file, cr: 0 });
      expect(bytes.includes(0x0a)).toBe(true);
    }
  });

  it.each([
    ['sin definir', undefined],
    ['vacía', ''],
    ['solo espacios', '   '],
  ])('T-48/DEC-28: migrate:status con NODE_ENV %s → código 2 sin conectar a MongoDB', async (_label, nodeEnv) => {
    const run = await migrateStatus(nodeEnv);
    expect(run.code).toBe(2);
    expect(run.stderr).toMatch(/NODE_ENV no está definida/);
    expect(run.stdout).toBe('');
    // Con conexión, el comando esperaría la selección de servidor (10 s) y terminaría con código 1.
    expect(run.ms).toBeLessThan(5_000);
  });

  it('T-48/DEC-28 (control): con NODE_ENV definido el comando sí intenta conectar y falla con código 1 (puerto cerrado)', async () => {
    const run = await migrateStatus('test');
    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/^Error en migraciones:/);
    expect(run.stderr).not.toMatch(/NODE_ENV no está definida/);
  }, 30_000);
});
