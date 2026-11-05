import { AuditService } from '../src/audit/audit.service';
import { PasswordHasher } from '../src/auth/password/password-hasher';
import { BootstrapAdminService } from '../src/bootstrap/bootstrap-admin.service';
import { MESSAGES, runBootstrapAdminCli, type BootstrapContext } from '../src/cli/bootstrap-admin-cli';
import { MailService } from '../src/mail/mail.service';
import { SecurityTokensService } from '../src/security-tokens/security-tokens.service';
import { UsersService } from '../src/users/users.service';
import { bootHttpApp, ORIGIN, type HttpHarness } from './support/http-app';

const LINK = /http:\/\/localhost:5173\/activar-cuenta#token=([A-Za-z0-9_-]+)/;
const PASSWORD = 'frase del primer administrador';

/**
 * T-35 + T-36 de punta a punta: el comando `bootstrap:admin` (su lógica real, `runBootstrapAdminCli`, sobre
 * la misma base que la API) y la activación por `POST /auth/activate` (CA-13, RN-06, RN-14; DEC-08).
 */
describe('bootstrap:admin → /auth/activate (T-35, e2e)', () => {
  let h: HttpHarness;
  let context: BootstrapContext;
  const out: string[] = [];
  const err: string[] = [];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
  const cli = (correo = 'admin@example.test') =>
    runBootstrapAdminCli(['--nombre', 'Ana Admin', '--correo', correo], {}, io, () => Promise.resolve(context));
  const activate = (token: string) =>
    h.http().post('/api/v1/auth/activate').set('Origin', ORIGIN).send({ token, password: PASSWORD });
  const tokenOf = (index = -1): string => {
    const match = LINK.exec(h.mail.sent.at(index)?.text ?? '');
    if (!match?.[1]) throw new Error('sin enlace de activación');
    return match[1];
  };

  beforeAll(async () => {
    h = await bootHttpApp('e2e_bootstrap');
    const service = new BootstrapAdminService(
      h.app.get(UsersService),
      h.app.get(SecurityTokensService),
      h.app.get(PasswordHasher),
      h.app.get(MailService),
      h.app.get(AuditService),
    );
    // El contexto lo cierra la suite (es el de la API), no el comando.
    context = { service, close: () => Promise.resolve() };
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    await h.usuarios.deleteMany({});
    h.mail.clear();
    h.mail.failNext = 0;
    out.length = 0;
    err.length = 0;
  });

  it('CA-13/RN-06: reemitir con el comando invalida el enlace anterior (→ 400) y el nuevo activa (→ 204, login 200)', async () => {
    await expect(cli()).resolves.toBe(0);
    expect(out).toEqual([MESSAGES.CREADA]);
    const anterior = tokenOf();
    await expect(cli(' ADMIN@example.test ')).resolves.toBe(0);
    expect(out).toEqual([MESSAGES.CREADA, MESSAGES.REEMITIDA]);
    const nuevo = tokenOf();
    expect(nuevo).not.toBe(anterior);

    await activate(anterior).expect(400);
    await activate(nuevo).expect(204);
    await h.http().post('/api/v1/auth/login').set('Origin', ORIGIN).send({ correo: 'admin@example.test', password: PASSWORD }).expect(200);

    // Ya hay un ADMIN ACTIVO: el comando se niega y no cambia nada.
    await expect(cli('otro@example.test')).resolves.toBe(1);
    expect(err).toEqual([MESSAGES.RECHAZADA_ADMIN_ACTIVO]);
    expect(await h.usuarios.countDocuments()).toBe(1);
  });

  it('antes de activar, la cuenta no puede iniciar sesión con ninguna contraseña', async () => {
    await expect(cli()).resolves.toBe(0);
    for (const password of [PASSWORD, '', 'admin', 'Ana Admin']) {
      const res = await h.http().post('/api/v1/auth/login').set('Origin', ORIGIN).send({ correo: 'admin@example.test', password });
      expect([400, 401]).toContain(res.status);
    }
  });

  it('DEC-09: fallo de SMTP → código 1 con mensaje genérico; reejecutar envía un enlace que sí activa', async () => {
    h.mail.failNext = 1;
    await expect(cli()).resolves.toBe(1);
    expect(err).toEqual([MESSAGES.CORREO_NO_ENVIADO]);
    expect(h.mail.sent).toHaveLength(0);
    await expect(cli()).resolves.toBe(0);
    await activate(tokenOf()).expect(204);
  });

  it('DEC-08: ni el token ni el enlace aparecen en la salida del comando ni en la del proceso', async () => {
    const output: string[] = [];
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    const so = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const se = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    try {
      await cli();
      await cli();
    } finally {
      so.mockRestore();
      se.mockRestore();
    }
    const all = [...out, ...err, ...output].join('\n');
    // La captura del proceso recibió los logs del envío (la comprobación no es vacía).
    expect(output.join('')).toContain('ACTIVACION');
    for (const index of [0, 1]) expect(all).not.toContain(tokenOf(index));
    expect(all).not.toMatch(/activar-cuenta|token=/);
  });
});
