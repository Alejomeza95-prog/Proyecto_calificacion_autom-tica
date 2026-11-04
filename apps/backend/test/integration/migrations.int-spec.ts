import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { AUTH_INDEXES } from '../../migrations/001-auth-indices';
import { SEED_ACCOUNTS } from '../../migrations/002-seed-roles-dev';
import {
  MigrationIntegrityError,
  MigrationRunner,
  type MigrationDefinition,
} from '../../src/database/migration-runner';
import { authMigrations, openTestDb, type TestDb } from '../support/mongo';

const SEED_PASSWORD = 'frase de prueba suficientemente larga';

function runner(testDb: TestDb, migrations: readonly MigrationDefinition[], nodeEnv = 'test'): MigrationRunner {
  return new MigrationRunner({ db: testDb.db, nodeEnv, env: { SEED_DEV_PASSWORD: SEED_PASSWORD } }, migrations);
}

async function indexNames(testDb: TestDb, collection: string): Promise<string[]> {
  return (await testDb.db.collection(collection).indexes()).map((i) => i.name ?? '').sort();
}

async function snapshot(testDb: TestDb): Promise<string> {
  const parts: string[] = [];
  for (const c of ['usuarios', 'tokens_seguridad', 'sesiones', 'auditoria_auth', 'migraciones']) {
    const idx = await testDb.db.collection(c).indexes().catch(() => []);
    const docs = await testDb.db.collection(c).find({}, { projection: { aplicada_en: 0, duracion_ms: 0 } }).toArray();
    parts.push(JSON.stringify({ c, idx, docs }));
  }
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

// T-38 (RN-03, RN-14), T-05 (RN-03, RN-10) y T-04 (CA-02, CA-13, RN-03, RN-06, RN-14).
describe('migraciones (T-38, T-05, T-04)', () => {
  let testDb: TestDb;
  const migrations = authMigrations();

  beforeEach(async () => {
    testDb = await openTestDb('migr');
  });

  afterEach(async () => {
    await testDb.drop();
  });

  it('descubre 001 y 002 en orden, con checksum SHA-256', () => {
    expect(migrations.map((m) => m.id)).toEqual(['001-auth-indices', '002-seed-roles-dev']);
    for (const m of migrations) expect(m.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(migrations[1]?.nonProductionOnly).toBe(true);
  });

  it('T-38: aplica en orden y registra id, checksum, aplicada_en y duracion_ms', async () => {
    expect(await runner(testDb, migrations).up()).toEqual(['001-auth-indices', '002-seed-roles-dev']);
    const records = await testDb.db.collection('migraciones').find({}).sort({ _id: 1 }).toArray();
    expect(records.map((r) => r._id)).toEqual(['001-auth-indices', '002-seed-roles-dev']);
    for (const [i, r] of records.entries()) {
      expect(r.checksum).toBe(migrations[i]?.checksum);
      expect(r.aplicada_en).toBeInstanceOf(Date);
      expect(typeof r.duracion_ms).toBe('number');
    }
  });

  it('T-05: migrate:up dos veces → la segunda no cambia nada', async () => {
    await runner(testDb, migrations).up();
    const before = await snapshot(testDb);
    expect(await runner(testDb, migrations).up()).toEqual([]);
    expect(await snapshot(testDb)).toBe(before);
  });

  it('T-04/T-05: getIndexes() coincide con plan §4', async () => {
    await runner(testDb, migrations).up();
    const expected = new Map<string, string[]>();
    for (const i of AUTH_INDEXES) expected.set(i.collection, [...(expected.get(i.collection) ?? ['_id_']), i.name]);
    for (const [collection, names] of expected) {
      expect(await indexNames(testDb, collection)).toEqual([...names].sort());
    }
    const tokensIdx = await testDb.db.collection('tokens_seguridad').indexes();
    expect(tokensIdx.find((i) => i.name === 'ttl_tokens_expira')?.expireAfterSeconds).toBe(86_400);
    expect(tokensIdx.find((i) => i.name === 'ix_tokens_usuario_proposito_vigentes')?.partialFilterExpression).toEqual({
      usado_en: null,
      invalidado_en: null,
    });
    const sesionesIdx = await testDb.db.collection('sesiones').indexes();
    expect(sesionesIdx.find((i) => i.name === 'ttl_sesiones_expira')?.expireAfterSeconds).toBe(0);
    expect(sesionesIdx.find((i) => i.name === 'ix_sesiones_refresh_previos')?.key).toEqual({ refresh_hashes_previos: 1 });
    const usuariosIdx = await testDb.db.collection('usuarios').indexes();
    expect(usuariosIdx.find((i) => i.name === 'ux_usuarios_bootstrap')).toMatchObject({
      unique: true,
      partialFilterExpression: { origen: 'BOOTSTRAP' },
    });
  });

  it('T-04: duplicados de correo_normalizado, token_hash y una segunda cuenta BOOTSTRAP → E11000', async () => {
    await runner(testDb, migrations.slice(0, 1)).up();
    const usuarios = testDb.db.collection('usuarios');
    await usuarios.insertOne({ correo_normalizado: 'ana@example.test', origen: 'AUTORREGISTRO' });
    await expect(
      usuarios.insertOne({ correo_normalizado: 'ana@example.test', origen: 'AUTORREGISTRO' }),
    ).rejects.toMatchObject({ code: 11000 });

    await usuarios.insertOne({ correo_normalizado: 'boot1@example.test', origen: 'BOOTSTRAP' });
    await expect(
      usuarios.insertOne({ correo_normalizado: 'boot2@example.test', origen: 'BOOTSTRAP' }),
    ).rejects.toMatchObject({ code: 11000 });
    // El índice parcial solo restringe BOOTSTRAP: varias cuentas de autorregistro conviven.
    await usuarios.insertOne({ correo_normalizado: 'otra@example.test', origen: 'AUTORREGISTRO' });

    const tokens = testDb.db.collection('tokens_seguridad');
    await tokens.insertOne({ token_hash: 'c'.repeat(64), usuario_id: new Types.ObjectId() });
    await expect(tokens.insertOne({ token_hash: 'c'.repeat(64), usuario_id: new Types.ObjectId() })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('T-05: el seed crea cuentas ACTIVA por rol de dos instituciones, sin contraseña versionada', async () => {
    await runner(testDb, migrations).up();
    const docs = await testDb.db.collection('usuarios').find({ seed: true }).toArray();
    expect(docs).toHaveLength(SEED_ACCOUNTS.length);
    expect(new Set(docs.map((d) => d.rol as string))).toEqual(new Set(['ADMIN', 'COORDINADOR', 'DOCENTE']));
    expect(new Set(docs.filter((d) => d.institucion_id).map((d) => String(d.institucion_id))).size).toBe(2);
    for (const d of docs) {
      expect(d.estado).toBe('ACTIVA');
      expect(d.correo_normalizado).toMatch(/@example\.test$/);
      expect(d.password_hash).toMatch(/^\$argon2id\$/);
    }
  });

  it('T-05: el seed se niega con NODE_ENV=production y sin SEED_DEV_PASSWORD', async () => {
    const seed = migrations[1];
    if (!seed) throw new Error('falta 002');
    await expect(seed.up({ db: testDb.db, nodeEnv: 'production', env: { SEED_DEV_PASSWORD: SEED_PASSWORD } })).rejects.toThrow(
      /production/,
    );
    await expect(seed.up({ db: testDb.db, nodeEnv: 'test', env: {} })).rejects.toThrow(/SEED_DEV_PASSWORD/);
  });

  it('T-38: en producción el runner omite el seed y no lo registra', async () => {
    expect(await runner(testDb, migrations, 'production').up()).toEqual(['001-auth-indices']);
    expect(await testDb.db.collection('usuarios').countDocuments()).toBe(0);
    const status = await runner(testDb, migrations, 'production').status();
    expect(status).toEqual([
      { id: '001-auth-indices', applied: true, skipped: false },
      { id: '002-seed-roles-dev', applied: false, skipped: true },
    ]);
  });

  it('T-38/T-05: down revierte solo el último; luego 001 elimina solo sus índices y conserva los datos', async () => {
    await runner(testDb, migrations).up();
    await testDb.db.collection('usuarios').insertOne({ correo_normalizado: 'propia@example.test', origen: 'AUTORREGISTRO' });

    expect(await runner(testDb, migrations).down()).toEqual(['002-seed-roles-dev']);
    expect(await testDb.db.collection('usuarios').countDocuments({ seed: true })).toBe(0);
    expect(await testDb.db.collection('usuarios').countDocuments()).toBe(1);
    expect(await indexNames(testDb, 'usuarios')).toContain('ux_usuarios_correo');

    await testDb.db.collection('usuarios').createIndex({ nombre: 1 }, { name: 'ajeno_a_la_migracion' });
    expect(await runner(testDb, migrations).down()).toEqual(['001-auth-indices']);
    expect(await indexNames(testDb, 'usuarios')).toEqual(['_id_', 'ajeno_a_la_migracion']);
    expect(await indexNames(testDb, 'sesiones')).toEqual(['_id_']);
    expect(await testDb.db.collection('usuarios').countDocuments()).toBe(1);
    expect(await testDb.db.collection('migraciones').countDocuments()).toBe(0);
    // Idempotente: revertir de nuevo no falla ni cambia nada.
    await expect(migrations[0]?.down({ db: testDb.db, nodeEnv: 'test', env: {} })).resolves.toBeUndefined();
  });

  it('T-38: down --to conserva la migración indicada', async () => {
    await runner(testDb, migrations).up();
    expect(await runner(testDb, migrations).down('001-auth-indices')).toEqual(['002-seed-roles-dev']);
    expect((await runner(testDb, migrations).status()).map((s) => s.applied)).toEqual([true, false]);
  });

  it('T-38: un checksum alterado de un script aplicado aborta sin cambios', async () => {
    await runner(testDb, migrations.slice(0, 1)).up();
    const before = await snapshot(testDb);
    const tampered = migrations.map((m) => (m.id === '001-auth-indices' ? { ...m, checksum: 'f'.repeat(64) } : m));
    await expect(runner(testDb, tampered).up()).rejects.toBeInstanceOf(MigrationIntegrityError);
    await expect(runner(testDb, tampered).down()).rejects.toBeInstanceOf(MigrationIntegrityError);
    expect(await snapshot(testDb)).toBe(before);
  });
});
