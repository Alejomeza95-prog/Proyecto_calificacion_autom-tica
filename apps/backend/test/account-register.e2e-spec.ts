import { Types } from 'mongoose';
import { REGISTER_MESSAGE } from '../src/auth/auth.controller';
import { Role } from '../src/authz/role';
import {
  INVITATION_RESOLVER,
  type InvitationAssignment,
  type InvitationResolver,
} from '../src/invitations/invitation-resolver';
import { AccountStatus } from '../src/users/account-status';
import { bootHttpApp, ORIGIN, TEST_PASSWORD, type HttpHarness } from './support/http-app';

/** Invitaciones sembradas en memoria (el almacén real es de otra historia; spec §3). */
class SeededInvitations implements InvitationResolver {
  readonly used = new Map<string, Types.ObjectId>();
  constructor(private readonly seeds: Record<string, { correo: string } & InvitationAssignment>) {}
  find(code: string, correo: string): Promise<InvitationAssignment | null> {
    const seed = this.seeds[code];
    if (!seed || seed.correo !== correo || this.used.has(code)) return Promise.resolve(null);
    return Promise.resolve({ rol: seed.rol, institucionId: seed.institucionId });
  }
  markUsed(code: string, usuarioId: Types.ObjectId): Promise<void> {
    this.used.set(code, usuarioId);
    return Promise.resolve();
  }
}

const INSTITUCION = new Types.ObjectId();
const invitations = new SeededInvitations({
  'inv-docente': { correo: 'invitada@example.test', rol: Role.DOCENTE, institucionId: INSTITUCION },
  'inv-incoherente': { correo: 'incoherente@example.test', rol: Role.DOCENTE, institucionId: null },
  'inv-admin': { correo: 'admin.invitado@example.test', rol: Role.ADMIN, institucionId: null },
});

const GENERIC = { mensaje: REGISTER_MESSAGE };

/** T-15: `POST /auth/register` (CA-01, CA-02, CA-03, CA-05, RN-02, RN-04, RN-18; plan §5, §8, §9.1). */
describe('POST /auth/register (T-15, e2e)', () => {
  let h: HttpHarness;
  const register = (body: Record<string, unknown>, origin: string | null = ORIGIN) => {
    const req = h.http().post('/api/v1/auth/register');
    if (origin !== null) req.set('Origin', origin);
    return req.send(body);
  };
  const body = (correo: string, extra: Record<string, unknown> = {}) => ({
    nombre: 'Ana Pérez',
    correo,
    password: TEST_PASSWORD,
    ...extra,
  });

  beforeAll(async () => {
    // Umbrales de registro ampliados para esta suite (todas las solicitudes salen de 127.0.0.1); el
    // límite se comprueba contra el valor leído de la configuración, no contra una constante (T-40).
    h = await bootHttpApp('e2e_register', {
      // Cola de Argon2Gate ampliada: 20 registros simultáneos miden la unicidad (CA-02); la saturación
      // (503 `servicio-saturado`) la cubre la suite de RNF-07. Esperas amplias de la cola y de Redis: en un
      // equipo cargado, 20 hashes en serie superaban 5 s y daban 503 (el fallo cerrado se prueba aparte).
      env: {
        RATE_LIMIT_REGISTER_EMAIL: '25/1h',
        RATE_LIMIT_REGISTER_IP: '1000/1h',
        ARGON2_QUEUE_MAX: '32',
        ARGON2_QUEUE_TIMEOUT_MS: '60000',
        RATE_LIMIT_REDIS_TIMEOUT_MS: '5000',
      },
      overrides: [{ provide: INVITATION_RESOLVER, useValue: invitations }],
    });
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  beforeEach(async () => {
    await h.resetRedis();
    h.mail.clear();
  });

  it('CA-01/RN-02/RN-18: con rol e institución en el cuerpo crea la cuenta PENDIENTE_VERIFICACION sin rol ni institución', async () => {
    const res = await register(
      body('rol.admin@example.test', { rol: 'ADMIN', institucion_id: INSTITUCION.toHexString(), institucionId: 'x' }),
    ).expect(202);
    expect(res.body).toEqual(GENERIC);
    expect(res.headers['cache-control']).toBe('no-store');

    const doc = await h.usuarios.findOne({ correo_normalizado: 'rol.admin@example.test' }).select('+password_hash').lean();
    expect(doc).toMatchObject({
      estado: AccountStatus.PENDIENTE_VERIFICACION,
      rol: null,
      institucion_id: null,
      origen: 'AUTORREGISTRO',
      correo_verificado_en: null,
      version_credenciales: 0,
    });
    // CA-03: solo el hash Argon2id; la contraseña en claro no está en la base.
    expect(doc?.password_hash).toMatch(/^\$argon2id\$/);
    const dump = JSON.stringify(await h.connection.db!.collection('usuarios').find().toArray());
    expect(dump).not.toContain(TEST_PASSWORD);
  });

  it('una propiedad no declarada (estado, origen) → 400 sin crear la cuenta; un rol no textual → 400 (DEC-21)', async () => {
    for (const extra of [{ estado: 'ACTIVA' }, { origen: 'BOOTSTRAP' }, { rol: 1 }]) {
      const res = await register(body('extra@example.test', extra)).expect(400);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.text).not.toMatch(/ACTIVA|BOOTSTRAP|frase de prueba/);
    }
    expect(await h.usuarios.countDocuments({ correo_normalizado: 'extra@example.test' })).toBe(0);
  });

  it('CA-03: contraseña fuera de política → 422 con la política, sin cuenta, sin correo ni contadores', async () => {
    const res = await register(body('corta@example.test', { password: 'once-carac1' })).expect(422);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({
      type: 'urn:omr-preicfes:problema:politica-password',
      title: 'La contraseña debe tener entre 12 y 128 caracteres',
      status: 422,
      errores: [{ campo: 'password', reglas: ['DEMASIADO_CORTA'] }],
    });
    expect(res.text).not.toContain('once-carac1');
    await register(body('corta@example.test', { password: 'x'.repeat(129) })).expect(422);
    expect(await h.usuarios.countDocuments({ correo_normalizado: 'corta@example.test' })).toBe(0);
    expect(await h.redisKeys('rl:*')).toEqual([]);
    // Una frase de exactamente 12 caracteres se acepta.
    await register(body('doce@example.test', { password: 'doce carac12' })).expect(202);
  });

  it('CA-04: envía un único correo de verificación con el token de 43 caracteres solo en el fragmento', async () => {
    await register(body('enlace@example.test')).expect(202);
    await h.waitForMail(1);
    const [mail] = h.mail.sent;
    expect(mail?.to).toBe('enlace@example.test');
    const link = /http:\/\/localhost:5173\/verificar-correo#token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? '');
    expect(link?.[1]).toHaveLength(43);
    const token = link?.[1] ?? '';
    // Solo el SHA-256 en la base; ni el token ni el enlace en MongoDB o Redis (DEC-09).
    const tokens = await h.connection.db!.collection('tokens_seguridad').find().toArray();
    expect(JSON.stringify(tokens)).not.toContain(token);
    expect(tokens.some((t) => t.proposito === 'VERIFICAR_CORREO')).toBe(true);
    for (const key of await h.redisKeys()) expect(key).not.toContain(token);
  });

  it('CA-02/RN-04: 20 registros simultáneos con variantes del mismo correo → 1 documento, 1 correo y respuestas idénticas', async () => {
    const variants = Array.from({ length: 20 }, (_, i) => (i % 2 ? ' Concurrente@Example.TEST ' : 'concurrente@example.test'));
    const responses = await Promise.all(variants.map((correo) => register(body(correo))));
    for (const r of responses) {
      expect(r.status).toBe(202);
      expect(r.text).toBe(JSON.stringify(GENERIC));
    }
    expect(await h.usuarios.countDocuments({ correo_normalizado: 'concurrente@example.test' })).toBe(1);
    await h.waitForMail(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.mail.sent).toHaveLength(1);
  }, 60_000);

  it('RN-04: repetir el registro de un correo existente → misma respuesta, sin correo y sin cambiar la cuenta', async () => {
    const nuevo = await register(body('existente@example.test')).expect(202);
    await h.waitForMail(1);
    const antes = await h.usuarios.findOne({ correo_normalizado: 'existente@example.test' }).select('+password_hash').lean();
    h.mail.clear();

    const repetido = await register(body(' EXISTENTE@example.test ', { nombre: 'Otro', password: 'otra frase distinta 123' }));
    expect(repetido.status).toBe(nuevo.status);
    expect(repetido.text).toBe(nuevo.text);
    expect(repetido.headers['content-type']).toBe(nuevo.headers['content-type']);
    await new Promise((r) => setTimeout(r, 50));
    expect(h.mail.sent).toHaveLength(0);
    const despues = await h.usuarios.findOne({ correo_normalizado: 'existente@example.test' }).select('+password_hash').lean();
    expect(despues?.password_hash).toBe(antes?.password_hash);
    expect(despues?.nombre).toBe(antes?.nombre);
  });

  it('CA-14: superar el límite por correo → 429 con Retry-After, igual con o sin cuenta y sin crear nada', async () => {
    const { max, windowMs } = h.config.rateLimits.REGISTER_EMAIL;
    for (let i = 0; i < max; i += 1) await register(body('limite@example.test')).expect(202);
    const existing = await register(body('limite@example.test')).expect(429);
    // Correo sin cuenta: se agotan sus intentos y se elimina la cuenta antes del intento que excede.
    for (let i = 0; i < max; i += 1) await register(body('limite.nuevo@example.test')).expect(202);
    await h.usuarios.deleteOne({ correo_normalizado: 'limite.nuevo@example.test' });
    const missing = await register(body('limite.nuevo@example.test')).expect(429);
    expect(await h.usuarios.countDocuments({ correo_normalizado: 'limite.nuevo@example.test' })).toBe(0);
    expect(existing.text).toBe(missing.text);
    expect(Number(existing.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(existing.headers['retry-after'])).toBeLessThanOrEqual(windowMs / 1000);
    // Las claves no contienen el correo (HMAC).
    for (const key of await h.redisKeys('rl:*')) expect(key).not.toMatch(/limite|example/);
  }, 60_000);

  it('DEC-20: sin Origin, con Origin ajeno o null → 403 sin crear cuenta ni consumir contadores', async () => {
    for (const origin of [null, 'https://evil.example.test', 'null', `${ORIGIN}.evil.test`]) {
      const res = await register(body('origen@example.test'), origin).expect(403);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    }
    expect(await h.usuarios.countDocuments({ correo_normalizado: 'origen@example.test' })).toBe(0);
    expect(await h.redisKeys('rl:*')).toEqual([]);
  });

  it('CA-05: una invitación válida para ese correo asigna rol e institución desde el servidor (origen INVITACION)', async () => {
    await register(body('invitada@example.test', { invitacion: 'inv-docente', rol: 'ADMIN' })).expect(202);
    const doc = await h.usuarios.findOne({ correo_normalizado: 'invitada@example.test' }).lean();
    expect(doc).toMatchObject({ estado: AccountStatus.PENDIENTE_VERIFICACION, rol: Role.DOCENTE, origen: 'INVITACION' });
    expect(doc?.institucion_id?.toHexString()).toBe(INSTITUCION.toHexString());
    expect(invitations.used.get('inv-docente')?.toHexString()).toBe(doc?._id.toHexString());
  });

  it('CA-05/RN-02/RN-14: una invitación de otro correo, inexistente, incoherente o con rol global no concede nada (autorregistro, misma respuesta)', async () => {
    const cases = [
      body('otra.persona@example.test', { invitacion: 'inv-docente' }),
      body('sin.invitacion@example.test', { invitacion: 'no-existe' }),
      body('incoherente@example.test', { invitacion: 'inv-incoherente' }),
      // RN-14: ni siquiera una invitación válida puede crear un ADMIN por una ruta pública.
      body('admin.invitado@example.test', { invitacion: 'inv-admin' }),
    ];
    for (const c of cases) {
      const res = await register(c).expect(202);
      expect(res.body).toEqual(GENERIC);
      const doc = await h.usuarios.findOne({ correo_normalizado: c.correo }).lean();
      expect(doc).toMatchObject({ rol: null, institucion_id: null, origen: 'AUTORREGISTRO' });
    }
  });

  it('CA-12/RN-12: la auditoría registra REGISTRO sin correo, contraseña, token ni hash', async () => {
    await register(body('auditada@example.test')).expect(202);
    await register(body('auditada@example.test')).expect(202);
    const audit = await h.connection.db!.collection('auditoria_auth').find({ evento: 'REGISTRO' }).toArray();
    expect(audit.some((a) => a.resultado === 'OK')).toBe(true);
    expect(audit.some((a) => a.resultado === 'RECHAZADO')).toBe(true);
    const dump = JSON.stringify(audit);
    expect(dump).not.toMatch(/@example\.test|argon2|frase de prueba/);
  });
});
