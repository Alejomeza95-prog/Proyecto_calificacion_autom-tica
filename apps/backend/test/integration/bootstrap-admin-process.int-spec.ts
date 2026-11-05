import { execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { PasswordHasher } from '../../src/auth/password/password-hasher';
import { MESSAGES, USAGE } from '../../src/cli/bootstrap-admin-cli';
import { Usuario } from '../../src/users/usuario.schema';
import { bootAuthCore, type AuthCoreHarness } from '../support/auth-core';
import { testEnv } from '../support/test-env';

const BACKEND = resolve(__dirname, '..', '..');
const SCRIPT = resolve(BACKEND, 'dist', 'cli', 'bootstrap-admin.js');
const SECRET = 'Contraseña-Por-Entrada-123';

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * T-35: el comando **compilado** (`node dist/cli/bootstrap-admin.js`, lo que ejecuta `pnpm bootstrap:admin`)
 * en un proceso aparte, contra una base aislada. El SMTP apunta a un puerto cerrado: cubre el fallo de
 * correo real con Nodemailer. Se compila en `beforeAll` con `pnpm build`.
 */
describe('bootstrap:admin como proceso (T-35, DEC-08)', () => {
  let h: AuthCoreHarness;
  let usuarios: Model<Usuario>;

  const run = (args: readonly string[], extraEnv: Record<string, string> = {}): Promise<Run> => {
    const env = {
      ...testEnv({ MONGODB_URI: h.config.mongodbUri, SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' }),
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...extraEnv,
    };
    return new Promise((done, fail) => {
      const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: BACKEND, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      // Una contraseña en la entrada estándar: el comando no la lee.
      child.stdin.end(`${SECRET}\n`);
      child.on('error', fail);
      child.on('close', (code) => done({ code, stdout, stderr }));
    });
  };
  const activationTokens = () =>
    h.connection.db!.collection('tokens_seguridad').find({ proposito: 'ACTIVAR_CUENTA' }).sort({ _id: 1 }).toArray();

  beforeAll(async () => {
    execSync('corepack pnpm -s build', { cwd: BACKEND, stdio: 'ignore' });
    h = await bootAuthCore('bootstrap_process');
    usuarios = h.moduleRef.get<Model<Usuario>>(getModelToken(Usuario.name));
  }, 240_000);

  afterAll(async () => {
    await h?.close();
  });

  it('--password (u otro argumento) → código 2 sin conectar ni repetir el valor', async () => {
    const r = await run(['--nombre', 'Ana', '--correo', 'admin@example.test', '--password', SECRET]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(USAGE);
    expect(r.stdout + r.stderr).not.toContain(SECRET);
    expect(await usuarios.countDocuments()).toBe(0);
  }, 60_000);

  it('ADMIN_PASSWORD en el entorno → código 2 sin conectar ni mostrar el valor', async () => {
    const r = await run(['--nombre', 'Ana', '--correo', 'admin@example.test'], { ADMIN_PASSWORD: SECRET });
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).not.toContain(SECRET);
    expect(await usuarios.countDocuments()).toBe(0);
  }, 60_000);

  it('SMTP caído → código 1 con mensaje genérico; la reejecución invalida el enlace anterior; sin contraseña utilizable', async () => {
    const first = await run(['--nombre', 'Ana Admin', '--correo', 'admin@example.test']);
    expect(first.code).toBe(1);
    expect(first.stdout).toBe('');
    // stderr: el mensaje genérico y, como mucho, el log del dispatcher (solo la plantilla, sin destinatario).
    expect(first.stderr).toContain(MESSAGES.CORREO_NO_ENVIADO);
    const otherLines = first.stderr.split(/\r?\n/).filter((l) => l.trim() && !l.includes(MESSAGES.CORREO_NO_ENVIADO));
    for (const line of otherLines) expect(line).toContain('Correo no enviado (plantilla ACTIVACION)');

    const docs = await usuarios.find({}).select('+password_hash').lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ origen: 'BOOTSTRAP', rol: 'ADMIN', estado: 'PENDIENTE_VERIFICACION', institucion_id: null });
    // La contraseña enviada por la entrada estándar no se usó.
    await expect(h.moduleRef.get(PasswordHasher).verify(docs[0]?.password_hash ?? '', SECRET)).resolves.toBe(false);
    const [primero] = await activationTokens();
    expect(primero).toMatchObject({ usado_en: null, invalidado_en: null });

    // Reemisión con el comando real: el enlace anterior queda invalidado y hay uno nuevo vigente.
    const second = await run(['--nombre', 'Ana Admin', '--correo', 'admin@example.test']);
    expect(second.code).toBe(1);
    const tokens = await activationTokens();
    expect(tokens).toHaveLength(2);
    expect(tokens[0]?.invalidado_en).toBeInstanceOf(Date);
    expect(tokens[1]).toMatchObject({ usado_en: null, invalidado_en: null });
    expect(await usuarios.countDocuments()).toBe(1);

    const audit = await h.connection.db!.collection('auditoria_auth').find({}).toArray();
    expect(audit.map((a) => String(a.evento))).toEqual(
      expect.arrayContaining(['ADMIN_INICIALIZADO', 'CORREO_NO_ENVIADO']),
    );
    const output = [first, second].map((r) => r.stdout + r.stderr).join('\n');
    expect(output).not.toMatch(/https?:|token|activar-cuenta|admin@example\.test/i);
    expect(output).not.toContain(SECRET);
    expect(JSON.stringify(audit)).not.toContain('admin@example.test');
  }, 120_000);
});
