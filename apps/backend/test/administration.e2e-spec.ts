import { Types } from 'mongoose';
import { AccountStatus } from '../src/users/account-status';
import { bearer, bootHttpApp, ORIGIN, type HttpHarness } from './support/http-app';

/**
 * HT-AUTH-03 Fases 2–3 contra la API completa (MongoDB y Redis de Compose, DEC-13).
 * T-08/T-09/T-17 panel de usuarios (CA-01..CA-03, RN-01..RN-04); T-11/T-18 pruebas e instituciones;
 * T-12..T-15/T-19 claves (CA-06..CA-12, RN-06..RN-14); T-29 aislamiento y auditoría (CA-11, CA-14, RN-13, RN-17).
 */
const INST_A = new Types.ObjectId('64a000000000000000000001');
const INST_B = new Types.ObjectId('64b000000000000000000002');

interface Session {
  readonly id: Types.ObjectId;
  readonly token: string;
}

describe('HT-AUTH-03 API', () => {
  let h: HttpHarness;
  let admin: Session;
  let coordA: Session;
  let docenteA: Session;
  let coordB: Session;

  const as = (s: Session) => ({ Authorization: bearer(s.token), Origin: ORIGIN });
  const get = (s: Session, url: string) => h.http().get(`/api/v1${url}`).set(as(s));
  const post = (s: Session, url: string, body: object) => h.http().post(`/api/v1${url}`).set(as(s)).send(body);
  const put = (s: Session, url: string, body: object) => h.http().put(`/api/v1${url}`).set(as(s)).send(body);
  const del = (s: Session, url: string) => h.http().delete(`/api/v1${url}`).set(as(s));
  const auditCount = (evento: string) => h.connection.collection('auditoria_admin').countDocuments({ evento });

  async function session(rol: 'ADMIN' | 'COORDINADOR' | 'DOCENTE', institucionId: Types.ObjectId | null): Promise<Session> {
    const user = await h.createUser({ rol, institucionId });
    const { accessToken } = await h.login(user);
    return { id: user.id, token: accessToken };
  }

  beforeAll(async () => {
    h = await bootHttpApp('htauth03', { migrations: ['001-auth-indices', '003-ht-auth-03-indices'] });
    const now = new Date();
    await h.connection.collection('instituciones').insertMany([
      { _id: INST_A, schemaVersion: 1, nombre: 'Institución A', activa: true, creado_en: now, actualizado_en: now },
      { _id: INST_B, schemaVersion: 1, nombre: 'Institución B', activa: true, creado_en: now, actualizado_en: now },
    ]);
    admin = await session('ADMIN', null);
    coordA = await session('COORDINADOR', INST_A);
    docenteA = await session('DOCENTE', INST_A);
    coordB = await session('COORDINADOR', INST_B);
  });

  afterAll(async () => {
    await h.close();
  });

  describe('panel de usuarios (CA-01..CA-03)', () => {
    it('CA-01: el ADMIN lista solo PENDIENTE_APROBACION, sin credenciales', async () => {
      const pending = await h.createUser({ estado: AccountStatus.PENDIENTE_APROBACION });
      await h.createUser({ estado: AccountStatus.PENDIENTE_VERIFICACION });
      const res = await get(admin, '/admin/usuarios?estado=PENDIENTE_APROBACION').expect(200);
      const body = res.body as { items: { id: string; correo: string }[]; total: number };
      expect(body.items.map((i) => i.id)).toEqual([pending.id.toHexString()]);
      expect(body.items[0]).toEqual({
        id: pending.id.toHexString(),
        nombre: 'Persona de prueba',
        correo: pending.correo,
        registradoEn: expect.any(String) as string,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    });

    it('CA-01/RN-01: COORDINADOR y DOCENTE → 403; sin sesión → 401', async () => {
      await get(coordA, '/admin/usuarios').expect(403);
      await get(docenteA, '/admin/usuarios').expect(403);
      await h.http().get('/api/v1/admin/usuarios').expect(401);
    });

    it('CA-02: aprobar deja la cuenta ACTIVA con rol e institución, puede iniciar sesión y se audita', async () => {
      const user = await h.createUser({ estado: AccountStatus.PENDIENTE_APROBACION });
      const res = await post(admin, `/admin/usuarios/${user.id.toHexString()}/aprobar`, {
        rol: 'DOCENTE',
        institucionId: INST_A.toHexString(),
      }).expect(200);
      expect(res.body).toEqual({ id: user.id.toHexString(), estado: 'ACTIVA', rol: 'DOCENTE', institucionId: INST_A.toHexString() });
      await h.login(user);
      const audit = await h.connection.collection('auditoria_admin').findOne({ evento: 'CUENTA_APROBADA', recurso_id: user.id });
      expect(audit).toMatchObject({ actor_id: admin.id, recurso_tipo: 'usuario', institucion_id: INST_A });
      expect(JSON.stringify(audit)).not.toContain(user.correo);
      const list = await get(admin, '/admin/usuarios').expect(200);
      expect((list.body as { items: { id: string }[] }).items.map((i) => i.id)).not.toContain(user.id.toHexString());
    });

    it('CA-03: datos inválidos → 400 sin cambiar la cuenta', async () => {
      const user = await h.createUser({ estado: AccountStatus.PENDIENTE_APROBACION });
      const url = `/admin/usuarios/${user.id.toHexString()}/aprobar`;
      await post(admin, url, { rol: 'ADMIN', institucionId: INST_A.toHexString() }).expect(400);
      await post(admin, url, { rol: 'DOCENTE' }).expect(400);
      await post(admin, url, { rol: 'DOCENTE', institucionId: new Types.ObjectId().toHexString() }).expect(400);
      expect((await h.usuarios.findById(user.id))?.estado).toBe('PENDIENTE_APROBACION');
    });

    it('CA-03: cuenta no pendiente → 409; inexistente → 404; autoaprobación y no ADMIN → 403; sin Origin → 403', async () => {
      const activa = await h.createUser({ rol: 'DOCENTE', institucionId: INST_A });
      const body = { rol: 'DOCENTE', institucionId: INST_A.toHexString() };
      await post(admin, `/admin/usuarios/${activa.id.toHexString()}/aprobar`, body).expect(409);
      await post(admin, `/admin/usuarios/${new Types.ObjectId().toHexString()}/aprobar`, body).expect(404);
      await post(admin, `/admin/usuarios/${admin.id.toHexString()}/aprobar`, body).expect(403);
      const pending = await h.createUser({ estado: AccountStatus.PENDIENTE_APROBACION });
      await post(coordA, `/admin/usuarios/${pending.id.toHexString()}/aprobar`, body).expect(403);
      await h.http()
        .post(`/api/v1/admin/usuarios/${pending.id.toHexString()}/aprobar`)
        .set('Authorization', bearer(admin.token))
        .send(body)
        .expect(403);
    });

    it('RN-04: dos aprobaciones simultáneas → exactamente una 200 y una 409', async () => {
      const user = await h.createUser({ estado: AccountStatus.PENDIENTE_APROBACION });
      const url = `/admin/usuarios/${user.id.toHexString()}/aprobar`;
      const results = await Promise.all([
        post(admin, url, { rol: 'DOCENTE', institucionId: INST_A.toHexString() }),
        post(admin, url, { rol: 'COORDINADOR', institucionId: INST_B.toHexString() }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await auditCount('CUENTA_APROBADA')).toBeGreaterThanOrEqual(2);
    });
  });

  describe('instituciones y pruebas (T-18)', () => {
    it('GET /instituciones solo ADMIN', async () => {
      const res = await get(admin, '/instituciones').expect(200);
      expect(res.body).toEqual([
        { id: INST_A.toHexString(), nombre: 'Institución A' },
        { id: INST_B.toHexString(), nombre: 'Institución B' },
      ]);
      await get(coordA, '/instituciones').expect(403);
    });

    it('COORDINADOR crea en su institución; DOCENTE → 403; duplicado → 409; otra institución → 404', async () => {
      const res = await post(coordA, '/pruebas', { nombre: 'Simulacro Uno' }).expect(201);
      expect(res.body).toMatchObject({ nombre: 'Simulacro Uno', institucionId: INST_A.toHexString() });
      await post(docenteA, '/pruebas', { nombre: 'Otra' }).expect(403);
      await post(coordA, '/pruebas', { nombre: 'simulacro uno' }).expect(409);
      await post(coordA, '/pruebas', { nombre: 'Ajena', institucionId: INST_B.toHexString() }).expect(404);
    });

    it('ADMIN debe indicar la institución', async () => {
      await post(admin, '/pruebas', { nombre: 'Sin institución' }).expect(400);
      await post(admin, '/pruebas', { nombre: 'Simulacro B', institucionId: INST_B.toHexString() }).expect(201);
    });

    it('el listado respeta el alcance (RN-13)', async () => {
      const a = (await get(docenteA, '/pruebas').expect(200)).body as { institucionId: string }[];
      expect(a.every((p) => p.institucionId === INST_A.toHexString())).toBe(true);
      const all = (await get(admin, '/pruebas').expect(200)).body as { institucionId: string }[];
      expect(new Set(all.map((p) => p.institucionId)).size).toBe(2);
    });
  });

  describe('claves de respuesta (CA-06..CA-12)', () => {
    let pruebaA: string;
    let pruebaB: string;
    const nueva = (extra: Record<string, unknown> = {}) => ({
      pruebaId: pruebaA,
      fecha: '2026-11-11',
      sesion: 'SESION_1',
      materia: 'MAT',
      cantidadPreguntas: 3,
      respuestas: ['A', null, 'C'],
      ...extra,
    });

    beforeAll(async () => {
      pruebaA = ((await post(coordA, '/pruebas', { nombre: 'Prueba Claves A' }).expect(201)).body as { id: string }).id;
      pruebaB = ((await post(coordB, '/pruebas', { nombre: 'Prueba Claves B' }).expect(201)).body as { id: string }).id;
    });

    it('CA-06: crea un BORRADOR con grilla de N respuestas y lo audita', async () => {
      const res = await post(coordA, '/claves-respuesta', nueva()).expect(201);
      expect(res.body).toMatchObject({
        pruebaId: pruebaA,
        pruebaNombre: 'Prueba Claves A',
        institucionId: INST_A.toHexString(),
        fecha: '2026-11-11',
        sesion: 'SESION_1',
        materia: 'MAT',
        cantidadPreguntas: 3,
        respuestas: ['A', null, 'C'],
        respondidas: 2,
        estado: 'BORRADOR',
        version: 0,
        publicadaEn: null,
      });
      expect(await auditCount('CLAVE_CREADA')).toBe(1);
    });

    it.each([
      ['respuesta E', { respuestas: ['A', 'E', 'C'] }],
      ['respuesta BLANK', { respuestas: ['A', 'BLANK', 'C'] }],
      ['respuesta MULTIPLE', { respuestas: ['A', 'MULTIPLE', 'C'] }],
      ['respuesta UNCERTAIN', { respuestas: ['UNCERTAIN', 'B', 'C'] }],
      ['materia FIS', { materia: 'FIS' }],
      ['sesión SESION_3', { sesion: 'SESION_3' }],
      ['0 preguntas', { cantidadPreguntas: 0, respuestas: [] }],
      ['101 preguntas', { cantidadPreguntas: 101, respuestas: Array<null>(101).fill(null) }],
      ['1.5 preguntas', { cantidadPreguntas: 1.5 }],
      ['longitud distinta', { respuestas: ['A'] }],
      ['fecha inexistente', { fecha: '2026-02-30' }],
      ['campo no declarado', { estado: 'PUBLICADA' }],
    ])('CA-07: %s → 400', async (_caso, extra) => {
      await post(coordA, '/claves-respuesta', nueva({ materia: 'CN', ...extra })).expect(400);
    });

    it('CA-08: misma prueba, fecha, sesión y materia → 409', async () => {
      await post(coordA, '/claves-respuesta', nueva({ materia: 'LC' })).expect(201);
      await post(coordA, '/claves-respuesta', nueva({ materia: 'LC' })).expect(409);
    });

    it('DEC-06: DOCENTE consulta pero no crea; prueba de otra institución → 404', async () => {
      await post(docenteA, '/claves-respuesta', nueva({ materia: 'CC' })).expect(403);
      await post(coordA, '/claves-respuesta', nueva({ materia: 'CC', pruebaId: pruebaB })).expect(404);
      await get(docenteA, '/claves-respuesta').expect(200);
    });

    it('CA-09/RN-14: edita con la versión vigente; versión vieja → 409 sin cambios', async () => {
      const created = (await post(coordA, '/claves-respuesta', nueva({ materia: 'ING' })).expect(201)).body as { id: string };
      const upd = await put(coordA, `/claves-respuesta/${created.id}`, {
        version: 0,
        cantidadPreguntas: 4,
        respuestas: ['A', 'B', 'C', null],
      }).expect(200);
      expect(upd.body).toMatchObject({ version: 1, cantidadPreguntas: 4, respuestas: ['A', 'B', 'C', null] });
      await put(coordA, `/claves-respuesta/${created.id}`, { version: 0, cantidadPreguntas: 1, respuestas: ['D'] }).expect(409);
      const now = (await get(coordA, `/claves-respuesta/${created.id}`).expect(200)).body as { cantidadPreguntas: number };
      expect(now.cantidadPreguntas).toBe(4);
      expect(await auditCount('CLAVE_ACTUALIZADA')).toBe(1);
    });

    it('CA-10/RN-10/RN-11: incompleta → 422 con faltantes; completa → PUBLICADA; luego no se edita ni elimina', async () => {
      const created = (await post(coordA, '/claves-respuesta', nueva({ sesion: 'SESION_2' })).expect(201)).body as { id: string };
      const incomplete = await post(coordA, `/claves-respuesta/${created.id}/publicar`, { version: 0 }).expect(422);
      expect(incomplete.body).toMatchObject({ type: 'urn:omr-preicfes:problema:clave-incompleta', preguntasFaltantes: [2] });

      await put(coordA, `/claves-respuesta/${created.id}`, { version: 0, cantidadPreguntas: 3, respuestas: ['A', 'B', 'C'] }).expect(200);
      const pub = await post(coordA, `/claves-respuesta/${created.id}/publicar`, { version: 1 }).expect(200);
      expect(pub.body).toMatchObject({ estado: 'PUBLICADA', version: 2, publicadaEn: expect.any(String) as string });

      await put(coordA, `/claves-respuesta/${created.id}`, { version: 2, cantidadPreguntas: 3, respuestas: ['D', 'D', 'D'] }).expect(409);
      await post(coordA, `/claves-respuesta/${created.id}/publicar`, { version: 2 }).expect(409);
      await del(coordA, `/claves-respuesta/${created.id}?version=2`).expect(409);
      expect(await auditCount('CLAVE_PUBLICADA')).toBe(1);
    });

    it('CA-12/RN-12: elimina un BORRADOR; una segunda vez → 404', async () => {
      const created = (await post(coordA, '/claves-respuesta', nueva({ materia: 'CC' })).expect(201)).body as { id: string };
      await del(coordA, `/claves-respuesta/${created.id}?version=0`).expect(204);
      await del(coordA, `/claves-respuesta/${created.id}?version=0`).expect(404);
      expect(await auditCount('CLAVE_ELIMINADA')).toBe(1);
    });

    it('CA-11/RN-13: aislamiento entre instituciones; el ADMIN ve ambas; filtros', async () => {
      const b = (await post(coordB, '/claves-respuesta', nueva({ pruebaId: pruebaB })).expect(201)).body as { id: string };
      await get(coordA, `/claves-respuesta/${b.id}`).expect(404);
      await put(coordA, `/claves-respuesta/${b.id}`, { version: 0, cantidadPreguntas: 1, respuestas: ['A'] }).expect(404);
      await del(coordA, `/claves-respuesta/${b.id}?version=0`).expect(404);
      await get(coordA, '/claves-respuesta/no-es-un-id').expect(404);

      const listA = (await get(docenteA, '/claves-respuesta?limite=100').expect(200)).body as {
        items: { institucionId: string }[];
      };
      expect(listA.items.every((c) => c.institucionId === INST_A.toHexString())).toBe(true);
      const listAdmin = (await get(admin, '/claves-respuesta?limite=100').expect(200)).body as {
        items: { institucionId: string }[];
      };
      expect(new Set(listAdmin.items.map((c) => c.institucionId)).size).toBe(2);

      const filtered = (await get(admin, '/claves-respuesta?materia=MAT&estado=PUBLICADA').expect(200)).body as {
        items: { materia: string; estado: string }[];
      };
      expect(filtered.items.every((c) => c.materia === 'MAT' && c.estado === 'PUBLICADA')).toBe(true);
      await get(admin, '/claves-respuesta?limite=101').expect(400);
    });

    it('CA-14/RN-17: la auditoría no guarda correos ni nombres', async () => {
      const docs = await h.connection.collection('auditoria_admin').find({}).toArray();
      expect(docs.length).toBeGreaterThan(0);
      expect(JSON.stringify(docs)).not.toMatch(/@example\.test|Persona de prueba/);
    });
  });
});
