import type { BootstrapOutcome } from '../bootstrap/bootstrap-admin.service';
import { GENERIC_FAILURE, MESSAGES, parseArgs, runBootstrapAdminCli, USAGE } from './bootstrap-admin-cli';

const SECRET = 'Contraseña-Secreta-123';

function harness(outcome: BootstrapOutcome | Error = 'CREADA') {
  const out: string[] = [];
  const err: string[] = [];
  const run = jest.fn(() => (outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)));
  const close = jest.fn(() => Promise.resolve());
  const openContext = jest.fn(() => Promise.resolve({ service: { run }, close }));
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
  return { out, err, run, close, openContext, io };
}

const OK_ARGS = ['--nombre', 'Ana Admin', '--correo', 'admin@example.test'];

/** T-35: comando `bootstrap:admin` (DEC-08; CA-13, RN-14, RN-12). */
describe('bootstrap:admin, consola (T-35)', () => {
  it('acepta solo --nombre y --correo', () => {
    expect(parseArgs(OK_ARGS)).toEqual({ nombre: 'Ana Admin', correo: 'admin@example.test' });
  });

  it.each([
    [['--nombre', 'Ana', '--correo', 'a@example.test', '--password', SECRET]],
    [['--password', SECRET, '--nombre', 'Ana', '--correo', 'a@example.test']],
    [['--nombre', 'Ana', '--correo', 'a@example.test', `--password=${SECRET}`]],
    [['-p', SECRET, '--nombre', 'Ana', '--correo', 'a@example.test']],
    [[SECRET, '--nombre', 'Ana', '--correo', 'a@example.test']],
    [['--nombre', 'Ana', '--nombre', SECRET, '--correo', 'a@example.test']],
  ])('rechaza cualquier otro argumento (%j) con código 2, sin abrir el contexto ni repetir el valor', async (argv) => {
    const t = harness();
    await expect(runBootstrapAdminCli(argv, {}, t.io, t.openContext)).resolves.toBe(2);
    expect(t.openContext).not.toHaveBeenCalled();
    expect(t.err).toContain(USAGE);
    expect([...t.out, ...t.err].join('\n')).not.toContain(SECRET);
  });

  it.each([[[]], [['--nombre', 'Ana']], [['--nombre', '   ', '--correo', 'a@example.test']], [['--nombre', 'Ana', '--correo', 'sin-arroba']]])(
    'datos faltantes o inválidos (%j) → código 2',
    async (argv) => {
      const t = harness();
      await expect(runBootstrapAdminCli(argv, {}, t.io, t.openContext)).resolves.toBe(2);
      expect(t.openContext).not.toHaveBeenCalled();
    },
  );

  it.each(['ADMIN_PASSWORD', 'BOOTSTRAP_ADMIN_PASSWORD', 'admin_pass'])(
    'una variable de contraseña (%s) → código 2 sin abrir el contexto ni mostrar su valor',
    async (name) => {
      const t = harness();
      await expect(runBootstrapAdminCli(OK_ARGS, { [name]: SECRET }, t.io, t.openContext)).resolves.toBe(2);
      expect(t.openContext).not.toHaveBeenCalled();
      expect([...t.out, ...t.err].join('\n')).not.toContain(SECRET);
    },
  );

  it('otras variables de entorno (MONGODB_URI, SEED_DEV_PASSWORD) no impiden la ejecución', async () => {
    const t = harness();
    const env = { MONGODB_URI: 'mongodb://x', SEED_DEV_PASSWORD: 'x' };
    await expect(runBootstrapAdminCli(OK_ARGS, env, t.io, t.openContext)).resolves.toBe(0);
  });

  it.each<[BootstrapOutcome, number]>([
    ['CREADA', 0],
    ['REEMITIDA', 0],
    ['RECHAZADA_ADMIN_ACTIVO', 1],
    ['RECHAZADA_OTRA_CUENTA_INICIAL', 1],
    ['RECHAZADA_EJECUCION_SIMULTANEA', 1],
    ['RECHAZADA_CORREO_EN_USO', 1],
    ['CORREO_NO_ENVIADO', 1],
  ])('%s → código %i y solo el mensaje genérico; cierra el contexto', async (outcome, code) => {
    const t = harness(outcome);
    await expect(runBootstrapAdminCli(OK_ARGS, {}, t.io, t.openContext)).resolves.toBe(code);
    expect([...t.out, ...t.err]).toEqual([MESSAGES[outcome]]);
    expect(code === 0 ? t.out : t.err).toEqual([MESSAGES[outcome]]);
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(t.run).toHaveBeenCalledWith({ nombre: 'Ana Admin', correo: 'admin@example.test' });
  });

  it('un error inesperado (p. ej. con la URI en el mensaje) → código 1 y mensaje genérico, sin el detalle', async () => {
    const t = harness(new Error('connect ECONNREFUSED mongodb://usuario:clave@host'));
    await expect(runBootstrapAdminCli(OK_ARGS, {}, t.io, t.openContext)).resolves.toBe(1);
    expect(t.err).toEqual([GENERIC_FAILURE]);
    expect(t.close).toHaveBeenCalledTimes(1);
  });

  it('ningún mensaje contiene enlaces ni tokens', () => {
    for (const text of [...Object.values(MESSAGES), GENERIC_FAILURE, USAGE]) expect(text).not.toMatch(/https?:|token/i);
  });
});
