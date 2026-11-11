import { Types, type Connection } from 'mongoose';
import { ClaveRespuesta, ClaveRespuestaSchema } from '../../src/answer-keys/clave-respuesta.schema';
import { AuditoriaAdmin, AuditoriaAdminSchema } from '../../src/audit/auditoria-admin.schema';
import { crearInstitucion } from '../../src/instituciones/crear-institucion';
import { Institucion, InstitucionSchema } from '../../src/instituciones/institucion.schema';
import { ResolucionManual, ResolucionManualSchema } from '../../src/manual-review/resolucion-manual.schema';
import { Prueba, PruebaSchema } from '../../src/pruebas/prueba.schema';
import { MigrationRunner } from '../../src/database/migration-runner';
import { authMigrations, deliberatelyInvalid, openTestDb, type TestDb } from '../support/mongo';

/**
 * HT-AUTH-03 Fase 1 contra MongoDB real (DEC-13):
 * T-01 instituciones + siembra; T-02 pruebas; T-03 claves_respuesta; T-04 auditoria_admin;
 * T-05 migración 003 (idempotente, reversible, índices únicos); T-16 esquema de resoluciones_manuales.
 */
const makeModels = (c: Connection) => ({
  instituciones: c.model(Institucion.name, InstitucionSchema),
  pruebas: c.model(Prueba.name, PruebaSchema),
  claves: c.model(ClaveRespuesta.name, ClaveRespuestaSchema),
  auditoria: c.model(AuditoriaAdmin.name, AuditoriaAdminSchema),
  resoluciones: c.model(ResolucionManual.name, ResolucionManualSchema),
});

const MIGRATIONS = ['003-ht-auth-03-indices', '004-seed-instituciones-dev'];

describe('HT-AUTH-03 persistencia (T-01..T-05, T-16)', () => {
  let testDb: TestDb;
  let m: ReturnType<typeof makeModels>;
  const runner = () =>
    new MigrationRunner(
      { db: testDb.db, nodeEnv: 'test', env: {} },
      authMigrations().filter((x) => x.id === '001-auth-indices' || MIGRATIONS.includes(x.id)),
    );

  beforeAll(async () => {
    testDb = await openTestDb('htauth03');
    m = makeModels(testDb.connection);
    await runner().up();
    await m.resoluciones.createCollection();
  });

  afterAll(async () => {
    await testDb.drop();
  });

  const instA = new Types.ObjectId('64a000000000000000000001');
  const instB = new Types.ObjectId('64b000000000000000000002');
  const actor = new Types.ObjectId();
  const claveBase = (extra: Partial<ClaveRespuesta> = {}): Partial<ClaveRespuesta> => ({
    institucion_id: instA,
    prueba_id: new Types.ObjectId(),
    fecha: new Date('2026-11-11T00:00:00.000Z'),
    sesion: 'SESION_1',
    materia: 'MAT',
    cantidad_preguntas: 3,
    respuestas: ['A', null, 'C'],
    creado_por: actor,
    actualizado_por: actor,
    ...extra,
  });

  describe('migraciones 003 y 004 (T-05, T-01)', () => {
    it('el runner descubre 001..004 en orden; la 004 es solo de desarrollo', () => {
      const all = authMigrations();
      expect(all.map((x) => x.id)).toEqual([
        '001-auth-indices',
        '002-seed-roles-dev',
        '003-ht-auth-03-indices',
        '004-seed-instituciones-dev',
      ]);
      expect(all[3]?.nonProductionOnly).toBe(true);
      expect(all[2]?.nonProductionOnly).toBe(false);
    });

    it('crean los índices con nombre fijo y siembran dos instituciones', async () => {
      const names = async (c: string) => (await testDb.db.collection(c).indexes()).map((i) => i.name);
      expect(await names('usuarios')).toContain('ix_usuarios_estado_creado');
      expect(await names('instituciones')).toContain('ux_instituciones_nombre');
      expect(await names('pruebas')).toContain('ux_pruebas_institucion_nombre');
      expect(await names('claves_respuesta')).toEqual(
        expect.arrayContaining(['ux_claves_identidad', 'ix_claves_institucion_estado_fecha']),
      );
      expect(await names('auditoria_admin')).toContain('ix_auditoria_admin_recurso');
      expect(await m.instituciones.countDocuments({ _id: { $in: [instA, instB] } })).toBe(2);
    });

    it('son idempotentes: ejecutar up de nuevo no cambia nada', async () => {
      const before = await m.instituciones.countDocuments();
      for (const def of authMigrations().filter((x) => MIGRATIONS.includes(x.id))) {
        await def.up({ db: testDb.db, nodeEnv: 'test', env: {} });
      }
      expect(await m.instituciones.countDocuments()).toBe(before);
    });

    it('la 004 se niega en producción', async () => {
      const seed = authMigrations().find((x) => x.id === '004-seed-instituciones-dev');
      await expect(seed?.up({ db: testDb.db, nodeEnv: 'production', env: {} })).rejects.toThrow(/production/);
    });
  });

  describe('instituciones (T-01)', () => {
    it('crearInstitucion es idempotente y no distingue mayúsculas', async () => {
      const first = await crearInstitucion(testDb.db, 'Colegio Prueba');
      const second = await crearInstitucion(testDb.db, 'colegio prueba');
      expect(first.creada).toBe(true);
      expect(second).toEqual({ creada: false, id: first.id });
    });

    it('rechaza nombre vacío', async () => {
      await expect(m.instituciones.create({ nombre: '   ' })).rejects.toThrow(/nombre/);
    });
  });

  describe('pruebas (T-02)', () => {
    it('exige institución, nombre y autor; schemaVersion 1', async () => {
      const ok = await m.pruebas.create({ institucion_id: instA, nombre: 'Simulacro 1', creado_por: actor });
      expect(ok.schemaVersion).toBe(1);
      await expect(m.pruebas.create(deliberatelyInvalid<Partial<Prueba>>({ nombre: 'Sin institución', creado_por: actor }))).rejects.toThrow(
        /institucion_id/,
      );
    });

    it('nombre único por institución sin distinguir mayúsculas (E11000); otra institución sí puede', async () => {
      await m.pruebas.create({ institucion_id: instA, nombre: 'Simulacro 2', creado_por: actor });
      await expect(m.pruebas.create({ institucion_id: instA, nombre: 'SIMULACRO 2', creado_por: actor })).rejects.toMatchObject({
        code: 11000,
      });
      await expect(m.pruebas.create({ institucion_id: instB, nombre: 'Simulacro 2', creado_por: actor })).resolves.toBeDefined();
    });
  });

  describe('claves_respuesta (T-03)', () => {
    it('crea un BORRADOR incompleto con version 0 y schemaVersion 1', async () => {
      const doc = await m.claves.create(claveBase());
      expect(m.claves.collection.collectionName).toBe('claves_respuesta');
      expect(doc.estado).toBe('BORRADOR');
      expect(doc.version).toBe(0);
      expect(doc.schemaVersion).toBe(1);
    });

    it.each([
      ['respuesta E', { respuestas: ['A', 'E', 'C'] }],
      ['respuesta BLANK', { respuestas: ['A', 'BLANK', 'C'] }],
      ['materia FIS', { materia: 'FIS' }],
      ['sesión SESION_3', { sesion: 'SESION_3' }],
      ['0 preguntas', { cantidad_preguntas: 0, respuestas: [] }],
      ['101 preguntas', { cantidad_preguntas: 101, respuestas: Array<null>(101).fill(null) }],
      ['1.5 preguntas', { cantidad_preguntas: 1.5 }],
      ['longitud distinta', { respuestas: ['A'] }],
      ['fecha con hora', { fecha: new Date('2026-11-11T10:00:00.000Z') }],
      ['PUBLICADA incompleta', { estado: 'PUBLICADA', publicada_en: new Date(), publicada_por: actor }],
    ])('rechaza %s (CA-07, RN-06, RN-08, RN-09, RN-10)', async (_caso, extra) => {
      await expect(
        m.claves.create(deliberatelyInvalid<Partial<ClaveRespuesta>>({ ...claveBase(), ...extra, prueba_id: new Types.ObjectId() })),
      ).rejects.toThrow();
    });

    it('RN-07: misma identidad en la misma institución → E11000; en otra institución → OK', async () => {
      const prueba_id = new Types.ObjectId();
      await m.claves.create(claveBase({ prueba_id }));
      await expect(m.claves.create(claveBase({ prueba_id }))).rejects.toMatchObject({ code: 11000 });
      await expect(m.claves.create(claveBase({ prueba_id, institucion_id: instB }))).resolves.toBeDefined();
    });
  });

  describe('auditoria_admin (T-04)', () => {
    const entry = {
      evento: 'CLAVE_CREADA' as const,
      actor_id: actor,
      recurso_tipo: 'clave_respuesta' as const,
      recurso_id: new Types.ObjectId(),
    };
    it('inserta un evento válido', async () => {
      const doc = await m.auditoria.create({ ...entry, detalle: { cantidad_preguntas: 3 } });
      expect(doc.schemaVersion).toBe(1);
    });
    it('strict: throw rechaza un campo no declarado como correo', async () => {
      await expect(
        m.auditoria.create(deliberatelyInvalid<Partial<AuditoriaAdmin>>({ ...entry, correo: 'x@example.test' })),
      ).rejects.toThrow();
    });
    it('detalle no admite objetos anidados', async () => {
      await expect(
        m.auditoria.create(deliberatelyInvalid<Partial<AuditoriaAdmin>>({ ...entry, detalle: { persona: { nombre: 'X' } } })),
      ).rejects.toThrow(/detalle/);
    });
  });

  describe('resoluciones_manuales (T-16, RN-16)', () => {
    const base = {
      institucion_id: instA,
      lectura_id: new Types.ObjectId(),
      numero_pregunta: 4,
      materia: 'CN' as const,
      estado_leido: 'UNCERTAIN' as const,
    };
    it('nace sin verificar y sin valor', async () => {
      const doc = await m.resoluciones.create(base);
      expect(doc.verificada).toBe(false);
      expect(doc.valor_resuelto).toBeNull();
    });
    it('rechaza verificada sin valor resuelto', async () => {
      await expect(
        m.resoluciones.create({ ...base, verificada: true, verificada_por: actor, verificada_en: new Date() }),
      ).rejects.toThrow(/verificada/);
    });
    it('acepta BLANK como valor resuelto verificado', async () => {
      await expect(
        m.resoluciones.create({ ...base, valor_resuelto: 'BLANK' as const, verificada: true, verificada_por: actor, verificada_en: new Date() }),
      ).resolves.toBeDefined();
    });
  });

  describe('reversión (T-05)', () => {
    it('down de la 003 elimina sus índices y es idempotente', async () => {
      const def = authMigrations().find((x) => x.id === '003-ht-auth-03-indices');
      await def?.down({ db: testDb.db, nodeEnv: 'test', env: {} });
      await def?.down({ db: testDb.db, nodeEnv: 'test', env: {} });
      const claveIdx = (await testDb.db.collection('claves_respuesta').indexes()).map((i) => i.name);
      expect(claveIdx).not.toContain('ux_claves_identidad');
    });
  });
});
