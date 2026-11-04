import { ConsoleLogger, Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { AuditService } from '../../src/audit/audit.service';
import { AuditoriaAuth } from '../../src/audit/auditoria-auth.schema';
import { RedactingLogger } from '../../src/audit/redacting-logger';
import { PasswordHasher } from '../../src/auth/password/password-hasher';
import { MailService } from '../../src/mail/mail.service';
import { MailDispatcher } from '../../src/mail/mail-dispatcher';
import { SecurityTokensService, sha256Hex } from '../../src/security-tokens/security-tokens.service';
import { TokenSeguridad } from '../../src/security-tokens/token-seguridad.schema';
import { Sesion } from '../../src/sessions/sesion.schema';
import { SessionsService } from '../../src/sessions/sessions.service';
import { InvalidTransitionError, UsersService } from '../../src/users/users.service';
import { Usuario } from '../../src/users/usuario.schema';
import { bootAuthCore, type AuthCoreHarness } from '../support/auth-core';

async function scanMongo(h: AuthCoreHarness, needle: string): Promise<string[]> {
  const db = h.connection.db;
  if (!db) throw new Error('sin base');
  const hits: string[] = [];
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    const docs = await db.collection(name).find({}).toArray();
    if (JSON.stringify(docs).includes(needle)) hits.push(name);
  }
  return hits;
}

async function scanRedis(h: AuthCoreHarness, needle: string): Promise<string[]> {
  const hits: string[] = [];
  for (const key of await h.redisKeys()) {
    if (key.includes(needle)) hits.push(key);
    const type = await h.redis.type(key);
    const value = type === 'string' ? await h.redis.get(key) : '';
    if (value?.includes(needle)) hits.push(key);
  }
  return hits;
}

describe('arranque de los módulos (T-38: sin índices al arrancar)', () => {
  it('con autoIndex/autoCreate en false, arrancar no crea colecciones ni índices', async () => {
    const h = await bootAuthCore('boot', { migrate: false });
    try {
      // Fuerza el registro y uso de los modelos.
      await h.moduleRef.get(UsersService).findByEmail('nadie@example.test');
      const collections = await h.connection.db?.listCollections().toArray();
      expect(collections).toEqual([]);
    } finally {
      await h.close();
    }
  });
});

describe('servicios de dominio (Fase 2)', () => {
  let h: AuthCoreHarness;
  let usuarios: Model<Usuario>;
  let users: UsersService;
  let tokens: SecurityTokensService;
  let sessions: SessionsService;

  beforeAll(async () => {
    h = await bootAuthCore('services');
    usuarios = h.moduleRef.get<Model<Usuario>>(getModelToken(Usuario.name));
    users = h.moduleRef.get(UsersService);
    tokens = h.moduleRef.get(SecurityTokensService);
    sessions = h.moduleRef.get(SessionsService);
  });

  afterAll(async () => {
    await h.close();
  });

  const createUser = async (extra: Partial<Usuario> = {}) =>
    usuarios.create({
      nombre: 'Persona',
      correo_normalizado: `u${new Types.ObjectId().toHexString()}@example.test`,
      password_hash: await h.moduleRef.get(PasswordHasher).hash('contraseña de prueba larga'),
      origen: 'INVITACION',
      ...extra,
    });

  const activeDocente = () =>
    createUser({ estado: 'ACTIVA', rol: 'DOCENTE', institucion_id: new Types.ObjectId() });

  // ---------------------------------------------------------------- T-06
  describe('UsersService (T-06)', () => {
    it('ACTIVA → BLOQUEADA incrementa version_credenciales en la misma actualización', async () => {
      const u = await activeDocente();
      await expect(users.changeStatus(u._id, 'ACTIVA', 'BLOQUEADA')).resolves.toBe(true);
      const after = await usuarios.findById(u._id).lean().orFail();
      expect(after.estado).toBe('BLOQUEADA');
      expect(after.version_credenciales).toBe(1);
    });

    it('PENDIENTE_VERIFICACION → PENDIENTE_APROBACION no cambia la versión', async () => {
      const u = await createUser();
      await expect(users.changeStatus(u._id, 'PENDIENTE_VERIFICACION', 'PENDIENTE_APROBACION')).resolves.toBe(true);
      expect((await usuarios.findById(u._id).lean().orFail()).version_credenciales).toBe(0);
    });

    it('no pasa a ACTIVA sin rol (RN-15) ni si el estado de origen ya cambió', async () => {
      const u = await createUser({ estado: 'PENDIENTE_APROBACION' });
      await expect(users.changeStatus(u._id, 'PENDIENTE_APROBACION', 'ACTIVA')).resolves.toBe(false);
      await expect(users.changeStatus(u._id, 'PENDIENTE_VERIFICACION', 'PENDIENTE_APROBACION')).resolves.toBe(false);
      expect((await usuarios.findById(u._id).lean().orFail()).estado).toBe('PENDIENTE_APROBACION');
    });

    it('una transición inválida lanza sin tocar la base', async () => {
      const u = await createUser();
      await expect(users.changeStatus(u._id, 'BLOQUEADA', 'ACTIVA')).rejects.toBeInstanceOf(InvalidTransitionError);
    });

    it('findByEmail normaliza mayúsculas y espacios (RN-03)', async () => {
      const u = await createUser({ correo_normalizado: 'normaliza@example.test' });
      expect((await users.findByEmail('  NORMALIZA@Example.test '))?._id.equals(u._id)).toBe(true);
    });
  });

  // ---------------------------------------------------------------- T-08
  describe('SecurityTokensService (T-08)', () => {
    const tokenModel = () => h.moduleRef.get<Model<TokenSeguridad>>(getModelToken(TokenSeguridad.name));

    it('emite 256 bits en Base64URL (43 caracteres) y solo guarda el SHA-256', async () => {
      const u = await createUser();
      const { token, tokenId } = await tokens.issue(u._id, 'VERIFICAR_CORREO');
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await tokenModel().findById(tokenId).select('+token_hash').lean().orFail();
      expect(stored.token_hash).toBe(sha256Hex(token));
      expect(await scanMongo(h, token)).toEqual([]);
    });

    it('vencido → rechazado; justo antes del vencimiento → válido (reloj controlado)', async () => {
      const u = await createUser();
      const a = await tokens.issue(u._id, 'RESTABLECER_PASSWORD');
      h.clock.advance(h.config.ttl.resetTokenMs + 1_000);
      await expect(tokens.consume(a.token, 'RESTABLECER_PASSWORD')).resolves.toBeNull();
      const b = await tokens.issue(u._id, 'RESTABLECER_PASSWORD');
      h.clock.advance(h.config.ttl.resetTokenMs - 1_000);
      await expect(tokens.consume(b.token, 'RESTABLECER_PASSWORD')).resolves.toMatchObject({ usuarioId: u._id });
    });

    it('usado → rechazado; invalidado por uno nuevo → rechazado; otro propósito → rechazado', async () => {
      const u = await createUser();
      const first = await tokens.issue(u._id, 'VERIFICAR_CORREO');
      const second = await tokens.issue(u._id, 'VERIFICAR_CORREO');
      await expect(tokens.consume(first.token, 'VERIFICAR_CORREO')).resolves.toBeNull();
      await expect(tokens.consume(second.token, 'ACTIVAR_CUENTA')).resolves.toBeNull();
      await expect(tokens.consume(second.token, 'VERIFICAR_CORREO')).resolves.not.toBeNull();
      await expect(tokens.consume(second.token, 'VERIFICAR_CORREO')).resolves.toBeNull();
    });

    it('consumo concurrente → exactamente 1 éxito', async () => {
      const u = await createUser();
      const { token } = await tokens.issue(u._id, 'ACTIVAR_CUENTA');
      const results = await Promise.all(Array.from({ length: 10 }, () => tokens.consume(token, 'ACTIVAR_CUENTA')));
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });

    it('findExistingId encuentra el registro sin filtrar por estado y no lo encuentra para un token inventado', async () => {
      const u = await createUser();
      const { token, tokenId } = await tokens.issue(u._id, 'VERIFICAR_CORREO');
      await tokens.consume(token, 'VERIFICAR_CORREO');
      expect((await tokens.findExistingId(token, 'VERIFICAR_CORREO'))?.equals(tokenId)).toBe(true);
      await expect(tokens.findExistingId('x'.repeat(43), 'VERIFICAR_CORREO')).resolves.toBeNull();
    });
  });

  // ---------------------------------------------------------------- T-09
  describe('SessionsService (T-09)', () => {
    const sesionModel = () => h.moduleRef.get<Model<Sesion>>(getModelToken(Sesion.name));

    it('crea copiando version_credenciales y rota A → B → C sin extender expira_en', async () => {
      const u = await activeDocente();
      const a = await sessions.create(u._id, u.version_credenciales);
      const b = await sessions.rotate(a.refreshToken);
      if (!b.ok) throw new Error(b.reason);
      const c = await sessions.rotate(b.refreshToken);
      if (!c.ok) throw new Error(c.reason);
      expect(c.sid.equals(a.sid)).toBe(true);
      expect(c.expiraEn.getTime()).toBe(a.expiraEn.getTime());
      const doc = await sesionModel().findById(a.sid).select('+refresh_hash +refresh_hashes_previos').lean().orFail();
      expect(doc.refresh_hashes_previos).toEqual([sha256Hex(a.refreshToken), sha256Hex(b.refreshToken)]);
      expect(doc.refresh_hash).toBe(sha256Hex(c.refreshToken));
      for (const t of [a.refreshToken, b.refreshToken, c.refreshToken]) expect(await scanMongo(h, t)).toEqual([]);
    });

    it.each(['anterior', 'más viejo'])('reutilizar un token rotado (%s) revoca la sesión completa y el vigente deja de servir', async (cual) => {
      const u = await activeDocente();
      const a = await sessions.create(u._id, 0);
      const b = await sessions.rotate(a.refreshToken);
      if (!b.ok) throw new Error(b.reason);
      const c = await sessions.rotate(b.refreshToken);
      if (!c.ok) throw new Error(c.reason);
      const reused = cual === 'anterior' ? b.refreshToken : a.refreshToken;
      await expect(sessions.rotate(reused)).resolves.toEqual({ ok: false, reason: 'REUTILIZACION' });
      await expect(sessions.rotate(c.refreshToken)).resolves.toMatchObject({ ok: false });
      const doc = await sesionModel().findById(a.sid).lean().orFail();
      expect(doc.motivo_revocacion).toBe('REUTILIZACION');
      const audit = h.moduleRef.get<Model<AuditoriaAuth>>(getModelToken(AuditoriaAuth.name));
      expect(await audit.countDocuments({ evento: 'REUTILIZACION_DETECTADA', usuario_id: u._id })).toBe(1);
    });

    it('otras sesiones de la cuenta siguen vigentes tras la reutilización en una', async () => {
      const u = await activeDocente();
      const s1 = await sessions.create(u._id, 0);
      const s2 = await sessions.create(u._id, 0);
      const r = await sessions.rotate(s1.refreshToken);
      expect(r.ok).toBe(true);
      await sessions.rotate(s1.refreshToken);
      await expect(sessions.findValid(s2.sid, 0)).resolves.not.toBeNull();
    });

    it('versión distinta o cuenta BLOQUEADA → la rotación falla sin token nuevo y revoca la sesión', async () => {
      const u = await activeDocente();
      const s = await sessions.create(u._id, 0);
      await usuarios.updateOne({ _id: u._id }, { $inc: { version_credenciales: 1 } });
      await expect(sessions.rotate(s.refreshToken)).resolves.toEqual({ ok: false, reason: 'CREDENCIALES_CAMBIADAS' });
      expect((await sesionModel().findById(s.sid).lean().orFail()).motivo_revocacion).toBe('RESET_PASSWORD');

      const v = await activeDocente();
      const t = await sessions.create(v._id, 0);
      await users.changeStatus(v._id, 'ACTIVA', 'BLOQUEADA');
      await expect(sessions.rotate(t.refreshToken)).resolves.toEqual({ ok: false, reason: 'CUENTA_NO_ACTIVA' });
      await expect(sessions.findValid(t.sid, 0)).resolves.toBeNull();
    });

    it('10 rotaciones simultáneas con la misma cookie → como máximo 1 éxito y un solo refresh_hash', async () => {
      const u = await activeDocente();
      const s = await sessions.create(u._id, 0);
      const results = await Promise.all(Array.from({ length: 10 }, () => sessions.rotate(s.refreshToken)));
      const ok = results.filter((r) => r.ok);
      expect(ok.length).toBeLessThanOrEqual(1);
      const doc = await sesionModel().findById(s.sid).select('+refresh_hashes_previos').lean().orFail();
      expect(doc.refresh_hashes_previos).toEqual([sha256Hex(s.refreshToken)]);
    });

    it('sesión vencida (7 días absolutos) → la rotación falla aunque se haya renovado', async () => {
      const u = await activeDocente();
      const s = await sessions.create(u._id, 0);
      h.clock.advance(h.config.ttl.sessionRefreshMs - 60_000);
      const r = await sessions.rotate(s.refreshToken);
      if (!r.ok) throw new Error(r.reason);
      h.clock.advance(61_000);
      await expect(sessions.rotate(r.refreshToken)).resolves.toMatchObject({ ok: false });
    });

    it('revocar todas → ninguna sesión vigente de la cuenta', async () => {
      const u = await activeDocente();
      const s = await Promise.all([1, 2, 3].map(() => sessions.create(u._id, 0)));
      await expect(sessions.revokeAllForUser(u._id, 'RESET_PASSWORD')).resolves.toBe(3);
      for (const x of s) await expect(sessions.findValid(x.sid, 0)).resolves.toBeNull();
    });
  });

  describe('SessionsService con SESSION_MAX_ROTATIONS bajo (T-09)', () => {
    let low: AuthCoreHarness;
    beforeAll(async () => {
      low = await bootAuthCore('rotlimit', { env: { SESSION_MAX_ROTATIONS: '3' } });
    });
    afterAll(async () => {
      await low.close();
    });

    it('la rotación que superaría el tope → revoca con LIMITE_ROTACIONES sin eliminar hashes', async () => {
      const model = low.moduleRef.get<Model<Usuario>>(getModelToken(Usuario.name));
      const svc = low.moduleRef.get(SessionsService);
      const u = await model.create({
        nombre: 'P',
        correo_normalizado: 'tope@example.test',
        password_hash: 'x',
        origen: 'INVITACION',
        estado: 'ACTIVA',
        rol: 'ADMIN',
      });
      const s = await svc.create(u._id, 0);
      let token = s.refreshToken;
      for (let i = 0; i < 3; i += 1) {
        const r = await svc.rotate(token);
        if (!r.ok) throw new Error(r.reason);
        token = r.refreshToken;
      }
      await expect(svc.rotate(token)).resolves.toEqual({ ok: false, reason: 'LIMITE_ROTACIONES' });
      const doc = await low.moduleRef
        .get<Model<Sesion>>(getModelToken(Sesion.name))
        .findById(s.sid)
        .select('+refresh_hashes_previos')
        .lean()
        .orFail();
      expect(doc.motivo_revocacion).toBe('LIMITE_ROTACIONES');
      expect(doc.refresh_hashes_previos).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------- T-10
  describe('AuditService y logger con redacción (T-10)', () => {
    it('la auditoría guarda ip_hash (no la IP) y ningún secreto; los logs capturados no contienen secretos', async () => {
      const audit = h.moduleRef.get(AuditService);
      const u = await createUser({ correo_normalizado: 'auditada@example.test' });
      await audit.record({ evento: 'LOGIN_FALLIDO', resultado: 'RECHAZADO', usuarioId: u._id, ip: '203.0.113.7' });
      const doc = await h.moduleRef
        .get<Model<AuditoriaAuth>>(getModelToken(AuditoriaAuth.name))
        .findOne({ usuario_id: u._id })
        .lean()
        .orFail();
      expect(doc.ip_hash).toMatch(/^[0-9a-f]{64}$/);
      const serialized = JSON.stringify(doc);
      expect(serialized).not.toContain('203.0.113.7');
      expect(serialized).not.toContain('auditada@example.test');

      const lines: string[] = [];
      const logger = new RedactingLogger();
      jest.spyOn(process.stdout, 'write').mockImplementation((c: string | Uint8Array) => (lines.push(String(c)), true));
      jest.spyOn(process.stderr, 'write').mockImplementation((c: string | Uint8Array) => (lines.push(String(c)), true));
      const { token } = await tokens.issue(u._id, 'VERIFICAR_CORREO');
      logger.log({ correo: 'auditada@example.test', password: 'contraseña de prueba larga', token, token_hash: sha256Hex(token) });
      logger.error(`fallo con http://localhost:5173/verificar-correo#token=${token} para auditada@example.test`);
      jest.restoreAllMocks();
      const out = lines.join('\n');
      for (const secret of ['auditada@example.test', 'contraseña de prueba larga', token, sha256Hex(token)]) {
        expect(out).not.toContain(secret);
      }
      expect(out).toContain('[REDACTADO]');
    });
  });

  // ---------------------------------------------------------------- T-12
  describe('correo sin persistencia del token (T-12, DEC-09)', () => {
    it('tras enviar, ningún documento de MongoDB ni clave de Redis contiene el token crudo', async () => {
      const u = await createUser({ correo_normalizado: 'correo@example.test' });
      h.mail.clear();
      const { token } = await tokens.issue(u._id, 'VERIFICAR_CORREO');
      h.moduleRef.get(MailService).sendVerification({ usuarioId: u._id, correo: 'correo@example.test', nombre: 'P' }, token);
      await h.moduleRef.get(MailDispatcher).drain();
      expect(h.mail.sent).toHaveLength(1);
      expect(h.mail.sent[0]?.text).toContain(`#token=${token}`);
      expect(await scanMongo(h, token)).toEqual([]);
      expect(await scanRedis(h, token)).toEqual([]);
    });

    it('un fallo SMTP se audita como CORREO_NO_ENVIADO en MongoDB, sin enlace', async () => {
      const fresh = await bootAuthCore('smtpfail');
      try {
        const u = await fresh.moduleRef.get<Model<Usuario>>(getModelToken(Usuario.name)).create({
          nombre: 'P',
          correo_normalizado: 'smtp@example.test',
          password_hash: 'x',
          origen: 'AUTORREGISTRO',
        });
        fresh.mail.failNext = 1;
        const { token } = await fresh.moduleRef.get(SecurityTokensService).issue(u._id, 'RESTABLECER_PASSWORD');
        jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(() => undefined);
        fresh.moduleRef.get(MailService).sendPasswordReset({ usuarioId: u._id, correo: 'smtp@example.test', nombre: 'P' }, token);
        await fresh.moduleRef.get(MailDispatcher).drain();
        jest.restoreAllMocks();
        const audit = fresh.moduleRef.get<Model<AuditoriaAuth>>(getModelToken(AuditoriaAuth.name));
        expect(await audit.countDocuments({ evento: 'CORREO_NO_ENVIADO', usuario_id: u._id })).toBe(1);
        expect(await scanMongo(fresh, token)).toEqual([]);
      } finally {
        await fresh.close();
      }
    });
  });
});
