import { Types } from 'mongoose';
import { Role } from '../src/authz/role';
import { SecurityTokensService } from '../src/security-tokens/security-tokens.service';
import { TokenPurpose } from '../src/security-tokens/token-purpose';
import { AccountStatus } from '../src/users/account-status';
import { AccountOrigin } from '../src/users/usuario.schema';
import { bootHttpApp, ORIGIN, type HttpHarness } from './support/http-app';

const PASSWORD = 'frase del primer administrador';
const INVALID_LINK = {
  type: 'urn:omr-preicfes:problema:enlace-invalido',
  title: 'El enlace no es válido o ya venció. Solicita uno nuevo',
  status: 400,
};

/**
 * T-36: `POST /auth/activate` (CA-13, CA-03, RN-06, RN-14; plan §5, §8, §9.1; DEC-08).
 * La cuenta BOOTSTRAP se siembra como la deja `bootstrap:admin` (T-35): ADMIN, sin institución,
 * PENDIENTE_VERIFICACION y sin contraseña conocida; el token se emite con `SecurityTokensService`.
 */
describe('activación del primer administrador (T-36, e2e)', () => {
  let h: HttpHarness;
  let tokens: SecurityTokensService;
  const activate = (body: Record<string, unknown>) =>
    h.http().post('/api/v1/auth/activate').set('Origin', ORIGIN).send(body);
  const login = (correo: string, password: string) =>
    h.http().post('/api/v1/auth/login').set('Origin', ORIGIN).send({ correo, password });

  /** Cuenta BOOTSTRAP pendiente (una sola por base: índice único parcial `ux_usuarios_bootstrap`). */
  const seedBootstrap = async () => {
    const user = await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION, rol: Role.ADMIN, correo: 'admin@example.test' });
    await h.usuarios.collection.updateOne({ _id: user.id }, { $set: { origen: AccountOrigin.BOOTSTRAP } });
    return user;
  };

  beforeAll(async () => {
    h = await bootHttpApp('e2e_activate');
    tokens = h.app.get(SecurityTokensService);
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    h.mail.clear();
  });

  afterEach(async () => {
    await h.usuarios.deleteMany({});
  });

  it('CA-13: activar → 204 sin sesión; ACTIVA, correo verificado, versión +1 y hash Argon2id; login con la contraseña → 200', async () => {
    const admin = await seedBootstrap();
    await login(admin.correo, PASSWORD).expect(401);
    const { token } = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);

    const res = await activate({ token, password: PASSWORD }).expect(204);
    expect(res.text).toBe('');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');

    const doc = await h.usuarios.findById(admin.id).select('+password_hash').lean().orFail();
    expect(doc).toMatchObject({ estado: AccountStatus.ACTIVA, rol: Role.ADMIN, institucion_id: null, origen: 'BOOTSTRAP', version_credenciales: 1 });
    expect(doc.correo_verificado_en).toBeInstanceOf(Date);
    expect(doc.password_hash).toMatch(/^\$argon2id\$/);
    await login(admin.correo, PASSWORD).expect(200);
    const audit = await h.connection.db!.collection('auditoria_auth').find({ evento: 'CUENTA_ACTIVADA', usuario_id: admin.id }).toArray();
    expect(audit).toEqual([expect.objectContaining({ resultado: 'OK' })]);
  });

  it('CA-13/RN-06: segundo uso, token inexistente, mal formado, vencido y reemplazado → el mismo 400', async () => {
    const admin = await seedBootstrap();
    const anterior = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    const actual = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    const replaced = await activate({ token: anterior.token, password: PASSWORD }).expect(400);
    expect(replaced.body).toEqual(INVALID_LINK);
    expect(replaced.headers['content-type']).toMatch(/^application\/problem\+json/);
    await activate({ token: actual.token, password: PASSWORD }).expect(204);
    expect((await activate({ token: actual.token, password: PASSWORD }).expect(400)).text).toBe(replaced.text);
    expect((await activate({ token: 'z'.repeat(43), password: PASSWORD }).expect(400)).text).toBe(replaced.text);
    expect((await activate({ token: 'no es un token', password: PASSWORD }).expect(400)).text).toBe(replaced.text);
  });

  it('vencido: con el reloj más allá de ACTIVATION_TOKEN_TTL → 400 y la cuenta sigue pendiente', async () => {
    const admin = await seedBootstrap();
    const { token } = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    h.clock.advance(h.config.ttl.activationTokenMs + 1_000);
    await activate({ token, password: PASSWORD }).expect(400);
    expect((await h.usuarios.findById(admin.id).lean().orFail()).estado).toBe(AccountStatus.PENDIENTE_VERIFICACION);
  });

  it('token de otro propósito (verificación o restablecimiento) → 400 sin cambios', async () => {
    const admin = await seedBootstrap();
    for (const proposito of [TokenPurpose.VERIFICAR_CORREO, TokenPurpose.RESTABLECER_PASSWORD]) {
      const { token } = await tokens.issue(admin.id, proposito);
      await activate({ token, password: PASSWORD }).expect(400);
    }
    expect((await h.usuarios.findById(admin.id).lean().orFail()).estado).toBe(AccountStatus.PENDIENTE_VERIFICACION);
  });

  it('RN-14: un token ACTIVAR_CUENTA de una cuenta que no es BOOTSTRAP no activa nada → 400', async () => {
    const persona = await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION, correo: 'auto@example.test' });
    const { token } = await tokens.issue(persona.id, TokenPurpose.ACTIVAR_CUENTA);
    await activate({ token, password: PASSWORD }).expect(400);
    const doc = await h.usuarios.findById(persona.id).lean().orFail();
    expect(doc).toMatchObject({ estado: AccountStatus.PENDIENTE_VERIFICACION, rol: null, version_credenciales: 0 });
    const audit = await h.connection.db!.collection('auditoria_auth').find({ evento: 'CUENTA_ACTIVADA', usuario_id: persona.id }).toArray();
    expect(audit).toEqual([expect.objectContaining({ resultado: 'RECHAZADO' })]);
  });

  it('CA-03: contraseña fuera de política → 422 sin consumir el token', async () => {
    const admin = await seedBootstrap();
    const { token } = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    const res = await activate({ token, password: 'corta' }).expect(422);
    expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:politica-password' });
    await activate({ token, password: PASSWORD }).expect(204);
  });

  it('DEC-21/RN-18: rol, institución u otra propiedad en el cuerpo → 400 sin efectos', async () => {
    const admin = await seedBootstrap();
    const { token } = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    for (const extra of [{ rol: 'DOCENTE' }, { institucion_id: new Types.ObjectId().toHexString() }, { estado: 'ACTIVA' }]) {
      await activate({ token, password: PASSWORD, ...extra }).expect(400);
    }
    expect(await h.redisKeys('rl:*')).toEqual([]);
    await activate({ token, password: PASSWORD }).expect(204);
  });

  it('CA-14: por enlace existente, el intento siguiente al máximo → 429 con Retry-After (DEC-15: 5 / 15 min)', async () => {
    const admin = await seedBootstrap();
    const { token } = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    const { max, windowMs } = h.config.rateLimits.ACTIVATE_TOKEN;
    for (let i = 0; i < max; i += 1) await activate({ token, password: PASSWORD }).expect(i === 0 ? 204 : 400);
    const limited = await activate({ token, password: PASSWORD }).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(windowMs / 1000);
  }, 60_000);

  it('CA-10: 5 activaciones simultáneas con el mismo token → exactamente un 204', async () => {
    const admin = await seedBootstrap();
    const { token } = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    const results = await Promise.all(Array.from({ length: 5 }, () => activate({ token, password: PASSWORD })));
    expect(results.filter((r) => r.status === 204)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(4);
    expect((await h.usuarios.findById(admin.id).lean().orFail()).version_credenciales).toBe(1);
  }, 60_000);

  it('DEC-08/DEC-09: ni el token ni la contraseña aparecen en los logs, MongoDB, Redis ni la auditoría', async () => {
    const admin = await seedBootstrap();
    const { token } = await tokens.issue(admin.id, TokenPurpose.ACTIVAR_CUENTA);
    const output: string[] = [];
    const capture = (chunk: unknown) => {
      output.push(String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    try {
      await activate({ token, password: PASSWORD }).expect(204);
      await activate({ token, password: PASSWORD }).expect(400);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    const logs = output.join('');
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(PASSWORD);
    for (const name of ['tokens_seguridad', 'usuarios', 'auditoria_auth']) {
      const dump = JSON.stringify(await h.connection.db!.collection(name).find().toArray());
      expect(dump).not.toContain(token);
      expect(dump).not.toContain(PASSWORD);
    }
    for (const key of await h.redisKeys()) expect(key).not.toContain(token);
  });
});
