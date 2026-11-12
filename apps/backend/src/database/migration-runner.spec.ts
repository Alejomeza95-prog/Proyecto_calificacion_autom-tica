import type { mongo } from 'mongoose';
import { isLocalEnvironment, LOCAL_ENVIRONMENTS } from '../config/environments';
import {
  MigrationEnvironmentError,
  MigrationRunner,
  resolveMigrationNodeEnv,
  type MigrationContext,
  type MigrationDefinition,
} from './migration-runner';

/**
 * T-48 (DEC-28, corrige H-01): las semillas solo se aplican con `NODE_ENV` en la lista de entornos
 * permitidos. Pruebas sin MongoDB: la colección `migraciones` se simula en memoria y la semilla es un
 * doble que registra si se ejecutó (la integración real está en `test/integration/migrations.int-spec.ts`).
 */

interface FakeRecord {
  _id: string;
  checksum: string;
}

/** Base de datos mínima: solo la colección `migraciones` que usa el runner. */
function fakeDb(initial: FakeRecord[] = []): { db: mongo.Db; records: FakeRecord[] } {
  const records = [...initial];
  const collection = {
    find: () => ({ toArray: () => Promise.resolve([...records]) }),
    insertOne: (doc: FakeRecord) => {
      records.push(doc);
      return Promise.resolve({ acknowledged: true });
    },
    deleteOne: (filter: { _id: string }) => {
      const i = records.findIndex((r) => r._id === filter._id);
      if (i >= 0) records.splice(i, 1);
      return Promise.resolve({ deletedCount: i >= 0 ? 1 : 0 });
    },
  };
  return { db: { collection: () => collection } as unknown as mongo.Db, records };
}

/** Migraciones de prueba: índices (siempre) y una semilla que «crea» un ADMIN de desarrollo. */
function migrations(createdAdmins: string[]): MigrationDefinition[] {
  return [
    { id: '001-indices', checksum: 'c1', up: () => Promise.resolve(), down: () => Promise.resolve() },
    {
      id: '002-seed',
      checksum: 'c2',
      nonProductionOnly: true,
      up: (ctx: MigrationContext) => {
        createdAdmins.push(`admin.seed (${ctx.nodeEnv})`);
        return Promise.resolve();
      },
      down: () => Promise.resolve(),
    },
  ];
}

describe('resolveMigrationNodeEnv (DEC-28)', () => {
  it.each([[undefined], [''], ['   ']])('NODE_ENV=%p → error, sin valor por defecto', (value) => {
    expect(() => resolveMigrationNodeEnv(value === undefined ? {} : { NODE_ENV: value })).toThrow(MigrationEnvironmentError);
  });

  it.each(['development', 'test', 'staging', 'production'])('NODE_ENV=%s → se conserva', (value) => {
    expect(resolveMigrationNodeEnv({ NODE_ENV: value })).toBe(value);
  });

  it('recorta espacios alrededor, igual que la configuración de la API', () => {
    expect(resolveMigrationNodeEnv({ NODE_ENV: ' test ' })).toBe('test');
  });
});

describe('lista de entornos permitidos (DEC-28)', () => {
  it('solo development y test son locales; la comparación es exacta', () => {
    expect(LOCAL_ENVIRONMENTS).toEqual(['development', 'test']);
    for (const env of ['development', 'test']) expect(isLocalEnvironment(env)).toBe(true);
    for (const env of ['staging', 'production', 'prod', 'Development', 'TEST', ' test', '']) {
      expect(isLocalEnvironment(env)).toBe(false);
    }
  });
});

describe('MigrationRunner: semillas solo en entornos permitidos (DEC-28)', () => {
  it.each(['development', 'test'])('NODE_ENV=%s → aplica la semilla y la registra', async (nodeEnv) => {
    const admins: string[] = [];
    const { db, records } = fakeDb();
    const runner = new MigrationRunner({ db, nodeEnv, env: {} }, migrations(admins));
    expect(await runner.up()).toEqual(['001-indices', '002-seed']);
    expect(admins).toHaveLength(1);
    expect(records.map((r) => r._id)).toEqual(['001-indices', '002-seed']);
  });

  it.each(['staging', 'production', 'prod', 'Development'])(
    'NODE_ENV=%s → omite la semilla: ningún ADMIN de desarrollo ni registro; 001 sí se aplica',
    async (nodeEnv) => {
      const admins: string[] = [];
      const { db, records } = fakeDb();
      const runner = new MigrationRunner({ db, nodeEnv, env: {} }, migrations(admins));
      expect(await runner.up()).toEqual(['001-indices']);
      expect(admins).toEqual([]);
      expect(records.map((r) => r._id)).toEqual(['001-indices']);
      expect(await runner.status()).toEqual([
        { id: '001-indices', applied: true, skipped: false },
        { id: '002-seed', applied: false, skipped: true },
      ]);
    },
  );

  it.each([[''], ['   ']])('NODE_ENV=%p → el runner no se construye y no toca la base', (nodeEnv) => {
    const admins: string[] = [];
    let touched = false;
    const db = {
      collection: () => {
        touched = true;
        return {};
      },
    } as unknown as mongo.Db;
    expect(() => new MigrationRunner({ db, nodeEnv, env: {} }, migrations(admins))).toThrow(MigrationEnvironmentError);
    expect(touched).toBe(false);
    expect(admins).toEqual([]);
  });

  it('semilla ya aplicada fuera de development/test → advertencia en up y status, sin cambiar registros', async () => {
    const admins: string[] = [];
    const initial = [
      { _id: '001-indices', checksum: 'c1' },
      { _id: '002-seed', checksum: 'c2' },
    ];
    const { db, records } = fakeDb(initial);
    const warnings: string[] = [];
    const logs: string[] = [];
    const runner = new MigrationRunner(
      { db, nodeEnv: 'staging', env: {} },
      migrations(admins),
      (m) => logs.push(m),
      (m) => warnings.push(m),
    );

    expect(await runner.up()).toEqual([]);
    await runner.status();
    expect(warnings).toHaveLength(2);
    for (const w of warnings) {
      expect(w).toMatch(/^ADVERTENCIA: la migración de solo desarrollo 002-seed consta aplicada con NODE_ENV=staging/);
      expect(w).toMatch(/No se modificó ningún dato/);
    }
    expect(logs).toEqual([]);
    expect(records).toEqual(initial);
    expect(admins).toEqual([]);
  });

  it('semilla aplicada en development/test → sin advertencia', async () => {
    const { db } = fakeDb([
      { _id: '001-indices', checksum: 'c1' },
      { _id: '002-seed', checksum: 'c2' },
    ]);
    const warnings: string[] = [];
    const runner = new MigrationRunner({ db, nodeEnv: 'test', env: {} }, migrations([]), () => undefined, (m) => warnings.push(m));
    await runner.up();
    await runner.status();
    expect(warnings).toEqual([]);
  });
});
