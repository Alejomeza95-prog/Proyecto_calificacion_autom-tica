import { Types, type Connection } from 'mongoose';
import { AuditoriaAuth, AuditoriaAuthSchema } from '../../src/audit/auditoria-auth.schema';
import { TokenSeguridad, TokenSeguridadSchema } from '../../src/security-tokens/token-seguridad.schema';
import { Sesion, SesionSchema } from '../../src/sessions/sesion.schema';
import { Usuario, UsuarioSchema } from '../../src/users/usuario.schema';
import { deliberatelyInvalid, openTestDb, type TestDb } from '../support/mongo';

const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);

// T-02 (RN-01, RN-02, RN-05, RN-15) y T-03 (RN-06, RN-11, RN-12, RN-16).
const makeModels = (connection: Connection) => ({
  usuarios: connection.model(Usuario.name, UsuarioSchema),
  tokens: connection.model(TokenSeguridad.name, TokenSeguridadSchema),
  sesiones: connection.model(Sesion.name, SesionSchema),
  auditoria: connection.model(AuditoriaAuth.name, AuditoriaAuthSchema),
});
type Models = ReturnType<typeof makeModels>;

describe('esquemas Mongoose (T-02, T-03)', () => {
  let testDb: TestDb;
  let usuarios: Models['usuarios'];
  let tokens: Models['tokens'];
  let sesiones: Models['sesiones'];
  let auditoria: Models['auditoria'];

  beforeAll(async () => {
    testDb = await openTestDb('schemas');
    ({ usuarios, tokens, sesiones, auditoria } = makeModels(testDb.connection));
    await usuarios.createCollection();
    await tokens.createCollection();
    await sesiones.createCollection();
    await auditoria.createCollection();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  const baseUser = (correo: string, extra: Partial<Usuario> = {}): Partial<Usuario> => ({
    nombre: 'Persona de prueba',
    correo_normalizado: correo,
    password_hash: '$argon2id$v=19$m=19456,t=2,p=1$x$y',
    origen: 'AUTORREGISTRO',
    ...extra,
  });
  const invalidUser = (correo: string, extra: Record<string, unknown>) =>
    deliberatelyInvalid<Partial<Usuario>>({ ...baseUser(correo), ...extra });

  describe('usuarios (T-02)', () => {
    it('usa la colección explícita, schemaVersion 1 y valores por defecto sin rol ni institución', async () => {
      const doc = await usuarios.create(baseUser('defecto@example.test'));
      expect(usuarios.collection.collectionName).toBe('usuarios');
      expect(doc.schemaVersion).toBe(1);
      expect(doc.estado).toBe('PENDIENTE_VERIFICACION');
      expect(doc.rol).toBeNull();
      expect(doc.institucion_id).toBeNull();
      expect(doc.version_credenciales).toBe(0);
    });

    it('rechaza un estado fuera del enum', async () => {
      await expect(
        usuarios.create(invalidUser('estado@example.test', { estado: 'SUSPENDIDA' })),
      ).rejects.toThrow(/estado/);
    });

    it.each([
      ['ACTIVA sin rol', { estado: 'ACTIVA' as const }],
      ['DOCENTE ACTIVO sin institución', { estado: 'ACTIVA' as const, rol: 'DOCENTE' as const }],
      ['ADMIN con institución', { estado: 'ACTIVA' as const, rol: 'ADMIN' as const, institucion_id: new Types.ObjectId() }],
    ])('RN-15: rechaza %s', async (_caso, extra) => {
      await expect(usuarios.create(baseUser(`rn15-${Math.random()}@example.test`, extra))).rejects.toThrow(/rol/);
    });

    it('acepta ADMIN ACTIVO sin institución y DOCENTE ACTIVO con institución', async () => {
      await expect(
        usuarios.create(baseUser('admin@example.test', { estado: 'ACTIVA', rol: 'ADMIN', origen: 'BOOTSTRAP' })),
      ).resolves.toBeDefined();
      await expect(
        usuarios.create(
          baseUser('docente@example.test', { estado: 'ACTIVA', rol: 'DOCENTE', institucion_id: new Types.ObjectId() }),
        ),
      ).resolves.toBeDefined();
    });

    it('acepta el origen BOOTSTRAP y rechaza un origen desconocido', async () => {
      await expect(usuarios.create(invalidUser('origen@example.test', { origen: 'API' }))).rejects.toThrow(/origen/);
    });

    it('RN-05: password_hash no se devuelve por defecto y toJSON nunca lo incluye', async () => {
      const created = await usuarios.create(baseUser('hash@example.test'));
      expect(JSON.stringify(created.toJSON())).not.toContain('password_hash');
      const found = await usuarios.findById(created._id).orFail();
      expect(found.password_hash).toBeUndefined();
      const explicit = await usuarios.findById(created._id).select('+password_hash').orFail();
      expect(explicit.password_hash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(explicit)).not.toContain('argon2id');
    });
  });

  describe('tokens_seguridad, sesiones y auditoria_auth (T-03)', () => {
    it('tokens: valida el propósito y el formato del hash; find() no devuelve el hash', async () => {
      const usuario_id = new Types.ObjectId();
      await expect(
        tokens.create(
          deliberatelyInvalid<Partial<TokenSeguridad>>({ usuario_id, proposito: 'OTRO', token_hash: HASH, expira_en: new Date() }),
        ),
      ).rejects.toThrow(/proposito/);
      await expect(
        tokens.create({ usuario_id, proposito: 'VERIFICAR_CORREO', token_hash: 'corto', expira_en: new Date() }),
      ).rejects.toThrow(/token_hash/);
      const created = await tokens.create({ usuario_id, proposito: 'ACTIVAR_CUENTA', token_hash: HASH, expira_en: new Date() });
      expect(created.schemaVersion).toBe(1);
      expect(JSON.stringify(created)).not.toContain(HASH);
      const found = await tokens.findById(created._id).lean().orFail();
      expect(found).not.toHaveProperty('token_hash');
    });

    it('sesiones: hashes con select:false y fuera de toJSON; motivo de revocación del enum', async () => {
      const usuario_id = new Types.ObjectId();
      await expect(
        sesiones.create(
          deliberatelyInvalid<Partial<Sesion>>({
            usuario_id,
            refresh_hash: HASH,
            version_credenciales: 0,
            expira_en: new Date(),
            motivo_revocacion: 'ROTACION',
          }),
        ),
      ).rejects.toThrow(/motivo_revocacion/);
      const created = await sesiones.create({
        usuario_id,
        refresh_hash: HASH,
        refresh_hashes_previos: [OTHER_HASH],
        version_credenciales: 3,
        expira_en: new Date(),
      });
      expect(JSON.stringify(created)).not.toMatch(/aaaa|bbbb/);
      const found = await sesiones.findById(created._id).lean().orFail();
      expect(found).not.toHaveProperty('refresh_hash');
      expect(found).not.toHaveProperty('refresh_hashes_previos');
      expect(found.version_credenciales).toBe(3);
    });

    it('auditoria_auth: evento del enum y rechazo de campos no declarados (RN-12)', async () => {
      await expect(
        auditoria.create(deliberatelyInvalid<Partial<AuditoriaAuth>>({ evento: 'INVENTADO', resultado: 'OK' })),
      ).rejects.toThrow(/evento/);
      await expect(
        auditoria.create(
          deliberatelyInvalid<Partial<AuditoriaAuth>>({ evento: 'LOGIN_FALLIDO', resultado: 'RECHAZADO', correo: 'x@example.test' }),
        ),
      ).rejects.toThrow(/correo/);
      const ok = await auditoria.create({ evento: 'LOGIN_OK', resultado: 'OK' });
      expect(ok.schemaVersion).toBe(1);
      expect(ok.usuario_id).toBeNull();
    });
  });
});
