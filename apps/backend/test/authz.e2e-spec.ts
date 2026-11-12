import { Body, Controller, Get, HttpCode, Module, Param, Patch, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { InjectConnection } from '@nestjs/mongoose';
import { IsString, MaxLength } from 'class-validator';
import { Types, type Connection } from 'mongoose';
import { AuthController } from '../src/auth/auth.controller';
import { AuthModule } from '../src/auth/auth.module';
import { AnyActiveRole, CurrentPrincipal, Public, Roles } from '../src/authz/decorators';
import { InstitutionScopePolicy } from '../src/authz/institution-scope.policy';
import type { Principal } from '../src/authz/principal';
import { Role } from '../src/authz/role';
import { ProblemException, ProblemType } from '../src/common/http/problem';
import { AccountStatus } from '../src/users/account-status';
import { bearer, bootHttpApp, ORIGIN, type HttpHarness } from './support/http-app';

/**
 * T-19 (CA-05, CA-11, RN-07, RN-10, RN-15, RN-16, RN-17): matriz rol × ruta y aislamiento institucional
 * con un controlador **de prueba** cuyo repositorio filtra por `institucion_id` en la propia consulta.
 */
const RECURSOS = 'recursos_prueba';

class RenameDto {
  @IsString()
  @MaxLength(60)
  nombre!: string;
}

interface Recurso {
  _id: Types.ObjectId;
  nombre: string;
  institucion_id: Types.ObjectId;
}

function parseId(id: string): Types.ObjectId {
  if (!/^[0-9a-f]{24}$/i.test(id)) throw new ProblemException(404, ProblemType.NO_ENCONTRADO);
  return new Types.ObjectId(id);
}

@Controller('prueba')
class ScopeTestController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly scope: InstitutionScopePolicy,
  ) {}

  private get recursos() {
    return this.connection.collection<Recurso>(RECURSOS);
  }

  @Roles(Role.ADMIN)
  @Get('solo-admin')
  soloAdmin(): { ok: true } {
    return { ok: true };
  }

  @Roles(Role.ADMIN, Role.COORDINADOR)
  @Get('coordinacion')
  coordinacion(): { ok: true } {
    return { ok: true };
  }

  /** Sin política de roles: denegada para todos (DEC-29). */
  @Get('sin-politica')
  sinPolitica(): { ok: true } {
    return { ok: true };
  }

  @AnyActiveRole()
  @Get('cualquiera')
  cualquiera(): { ok: true } {
    return { ok: true };
  }

  @AnyActiveRole()
  @Get('recursos')
  async list(@CurrentPrincipal() principal: Principal): Promise<string[]> {
    const docs = await this.recursos.find(this.scope.scoped(principal, {})).sort({ nombre: 1 }).toArray();
    return docs.map((d) => d.nombre);
  }

  @AnyActiveRole()
  @Get('recursos/:id')
  async get(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<{ nombre: string }> {
    const doc = await this.recursos.findOne(this.scope.scoped(principal, { _id: parseId(id) }));
    if (!doc) throw new ProblemException(404, ProblemType.NO_ENCONTRADO);
    return { nombre: doc.nombre };
  }

  @Roles(Role.ADMIN, Role.COORDINADOR)
  @Patch('recursos/:id')
  @HttpCode(204)
  async rename(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: RenameDto): Promise<void> {
    const result = await this.recursos.updateOne(this.scope.scoped(principal, { _id: parseId(id) }), {
      $set: { nombre: body.nombre },
    });
    if (result.matchedCount === 0) throw new ProblemException(404, ProblemType.NO_ENCONTRADO);
  }
}

/** Clase solo ADMIN (DEC-29): los métodos restringen o heredan, nunca amplían. */
@Roles(Role.ADMIN)
@Controller('prueba-admin')
class AdminClassTestController {
  @Get('heredada')
  heredada(): { ok: true } {
    return { ok: true };
  }

  @Roles(Role.DOCENTE)
  @Get('metodo-docente')
  metodoDocente(): { ok: true } {
    return { ok: true };
  }

  @AnyActiveRole()
  @Get('metodo-cualquiera')
  metodoCualquiera(): { ok: true } {
    return { ok: true };
  }
}

/** Ruta pública de prueba sin política de roles: sigue siendo pública (DEC-29). */
@Public()
@Controller('prueba-publica')
class PublicTestController {
  @Get()
  publica(): { ok: true } {
    return { ok: true };
  }
}

@Module({ imports: [AuthModule], controllers: [ScopeTestController, AdminClassTestController, PublicTestController] })
class ScopeTestModule {}

describe('autorización y alcance institucional (T-19, e2e)', () => {
  let h: HttpHarness;
  const instA = new Types.ObjectId();
  const instB = new Types.ObjectId();
  const recursoA = new Types.ObjectId();
  const recursoB = new Types.ObjectId();
  const tokens: Record<string, string> = {};
  let docenteA: { id: Types.ObjectId; correo: string; password: string };

  beforeAll(async () => {
    h = await bootHttpApp('e2e_authz', { imports: [ScopeTestModule] });
    await h.connection.collection(RECURSOS).insertMany([
      { _id: recursoA, nombre: 'Recurso A', institucion_id: instA },
      { _id: recursoB, nombre: 'Recurso B', institucion_id: instB },
    ]);
    const admin = await h.createUser({ rol: Role.ADMIN });
    const coordA = await h.createUser({ rol: Role.COORDINADOR, institucionId: instA });
    docenteA = await h.createUser({ rol: Role.DOCENTE, institucionId: instA });
    const docenteB = await h.createUser({ rol: Role.DOCENTE, institucionId: instB });
    tokens.admin = (await h.login(admin)).accessToken;
    tokens.coordA = (await h.login(coordA)).accessToken;
    tokens.docenteA = (await h.login(docenteA)).accessToken;
    tokens.docenteB = (await h.login(docenteB)).accessToken;
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  const get = (path: string, token?: string) => {
    const req = h.http().get(path);
    return token ? req.set('Authorization', bearer(token)) : req;
  };

  it('sin token, token mal formado o firmado con otro secreto → 401 problem+json', async () => {
    for (const auth of [undefined, 'Bearer x', 'Basic abc', bearer('a.b.c')]) {
      const req = h.http().get('/api/v1/auth/me');
      const res = await (auth ? req.set('Authorization', auth) : req).expect(401);
      expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:no-autenticado', status: 401 });
    }
  });

  it('GET /auth/me devuelve el principal sin password_hash ni hashes (RN-05)', async () => {
    const res = await get('/api/v1/auth/me', tokens.docenteA).expect(200);
    expect(res.body).toEqual({
      id: docenteA.id.toHexString(),
      nombre: 'Persona de prueba',
      rol: 'DOCENTE',
      institucionId: instA.toHexString(),
      estado: 'ACTIVA',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|password/i);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('matriz rol × ruta: rol insuficiente → 403; rol permitido → 200 (CA-11)', async () => {
    const cases: [string, string, number][] = [
      ['/api/v1/prueba/solo-admin', 'admin', 200],
      ['/api/v1/prueba/solo-admin', 'coordA', 403],
      ['/api/v1/prueba/solo-admin', 'docenteA', 403],
      ['/api/v1/prueba/coordinacion', 'admin', 200],
      ['/api/v1/prueba/coordinacion', 'coordA', 200],
      ['/api/v1/prueba/coordinacion', 'docenteA', 403],
      ['/api/v1/prueba/coordinacion', 'docenteB', 403],
    ];
    for (const [path, who, status] of cases) {
      const res = await get(path, tokens[who]);
      expect({ path, who, status: res.status }).toEqual({ path, who, status });
    }
    const forbidden = await get('/api/v1/prueba/solo-admin', tokens.docenteA);
    expect(forbidden.body).toMatchObject({ type: 'urn:omr-preicfes:problema:acceso-denegado', status: 403 });
  });

  it('T-49/DEC-29: ruta sin política → 403 para todos; @AnyActiveRole() → 200 para todos', async () => {
    for (const who of ['admin', 'coordA', 'docenteA', 'docenteB']) {
      const denied = await get('/api/v1/prueba/sin-politica', tokens[who]);
      expect({ who, status: denied.status }).toEqual({ who, status: 403 });
      expect(denied.body).toMatchObject({ type: 'urn:omr-preicfes:problema:acceso-denegado', status: 403 });
      const any = await get('/api/v1/prueba/cualquiera', tokens[who]);
      expect({ who, status: any.status }).toEqual({ who, status: 200 });
    }
    await get('/api/v1/prueba/sin-politica').expect(401);
  });

  it('T-49/DEC-29: clase ADMIN + método DOCENTE → 403 para todos; los métodos heredados o @AnyActiveRole() solo admiten ADMIN', async () => {
    const cases: [string, string, number][] = [
      ['/api/v1/prueba-admin/metodo-docente', 'docenteA', 403],
      ['/api/v1/prueba-admin/metodo-docente', 'admin', 403],
      ['/api/v1/prueba-admin/metodo-docente', 'coordA', 403],
      ['/api/v1/prueba-admin/heredada', 'admin', 200],
      ['/api/v1/prueba-admin/heredada', 'coordA', 403],
      ['/api/v1/prueba-admin/heredada', 'docenteA', 403],
      ['/api/v1/prueba-admin/metodo-cualquiera', 'admin', 200],
      ['/api/v1/prueba-admin/metodo-cualquiera', 'coordA', 403],
      ['/api/v1/prueba-admin/metodo-cualquiera', 'docenteA', 403],
    ];
    for (const [path, who, status] of cases) {
      const res = await get(path, tokens[who]);
      expect({ path, who, status: res.status }).toEqual({ path, who, status });
    }
  });

  it('T-49/DEC-29: /auth/me y /auth/logout siguen disponibles para ADMIN, COORDINADOR y DOCENTE; las rutas públicas siguen públicas', async () => {
    for (const who of ['admin', 'coordA', 'docenteA']) {
      const res = await get('/api/v1/auth/me', tokens[who]);
      expect({ who, status: res.status }).toEqual({ who, status: 200 });
    }
    await h.http().get('/api/v1/prueba-publica').expect(200, { ok: true });
    await h.http().get('/api/v1/health').expect(200, { status: 'ok' });
    const persona = await h.createUser({ rol: Role.COORDINADOR, institucionId: instA });
    const { accessToken } = await h.login(persona);
    await h.http().post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Authorization', bearer(accessToken)).expect(204);
    await get('/api/v1/auth/me', accessToken).expect(401);
  });

  it('recurso de otra institución → 404 idéntico a uno inexistente (DEC-14, RN-17)', async () => {
    const foreign = await get(`/api/v1/prueba/recursos/${recursoB.toHexString()}`, tokens.docenteA).expect(404);
    const missing = await get(`/api/v1/prueba/recursos/${new Types.ObjectId().toHexString()}`, tokens.docenteA).expect(404);
    expect(foreign.body).toEqual(missing.body);
    await get(`/api/v1/prueba/recursos/${recursoA.toHexString()}`, tokens.docenteA).expect(200, { nombre: 'Recurso A' });
  });

  it('listado con 2 instituciones → solo las propias; ADMIN ve ambas', async () => {
    await get('/api/v1/prueba/recursos', tokens.docenteA).expect(200, ['Recurso A']);
    await get('/api/v1/prueba/recursos', tokens.docenteB).expect(200, ['Recurso B']);
    await get('/api/v1/prueba/recursos', tokens.admin).expect(200, ['Recurso A', 'Recurso B']);
  });

  it('actualización por _id de un documento ajeno → 404 y no lo modifica; ADMIN sí puede', async () => {
    await h
      .http()
      .patch(`/api/v1/prueba/recursos/${recursoB.toHexString()}`)
      .set('Authorization', bearer(tokens.coordA))
      .send({ nombre: 'alterado' })
      .expect(404);
    expect(await h.connection.collection(RECURSOS).findOne({ _id: recursoB })).toMatchObject({ nombre: 'Recurso B' });

    await h
      .http()
      .patch(`/api/v1/prueba/recursos/${recursoB.toHexString()}`)
      .set('Authorization', bearer(tokens.admin))
      .send({ nombre: 'Recurso B' })
      .expect(204);
  });

  it('un cuerpo con institucion_id no amplía el alcance (whitelist estricta, RN-18)', async () => {
    await h
      .http()
      .patch(`/api/v1/prueba/recursos/${recursoB.toHexString()}`)
      .set('Authorization', bearer(tokens.coordA))
      .send({ nombre: 'x', institucion_id: instB.toHexString() })
      .expect(400);
  });

  it('DOCENTE ACTIVO sin institución (documento incoherente) → 403 en cualquier ruta (RN-15)', async () => {
    const huerfano = await h.createUser({ rol: Role.DOCENTE, institucionId: instA });
    const { accessToken } = await h.login(huerfano);
    await h.usuarios.collection.updateOne({ _id: huerfano.id }, { $set: { institucion_id: null } });
    await get('/api/v1/auth/me', accessToken).expect(403);
    await get('/api/v1/prueba/recursos', accessToken).expect(403);
  });

  it('cambio de rol o institución en la base con JWT vigente → aplica en la siguiente solicitud (RN-15)', async () => {
    const persona = await h.createUser({ rol: Role.DOCENTE, institucionId: instA });
    const { accessToken } = await h.login(persona);
    await get('/api/v1/prueba/coordinacion', accessToken).expect(403);

    await h.usuarios.collection.updateOne({ _id: persona.id }, { $set: { rol: 'COORDINADOR', institucion_id: instB } });
    await get('/api/v1/prueba/coordinacion', accessToken).expect(200);
    await get('/api/v1/prueba/recursos', accessToken).expect(200, ['Recurso B']);
  });

  it('cuenta que deja de estar ACTIVA (changeStatus) → su JWT vigente → 401 (RN-07, RN-16)', async () => {
    const persona = await h.createUser({ rol: Role.DOCENTE, institucionId: instA });
    const { accessToken } = await h.login(persona);
    await get('/api/v1/auth/me', accessToken).expect(200);
    await h.usuarios.collection.updateOne(
      { _id: persona.id },
      { $set: { estado: AccountStatus.BLOQUEADA }, $inc: { version_credenciales: 1 } },
    );
    await get('/api/v1/auth/me', accessToken).expect(401);
  });

  it('OriginGuard: TODA ruta POST registrada en AuthController exige un Origin permitido (DEC-20, RNF-06)', async () => {
    // Inspección de las rutas del controlador: cualquier ruta POST nueva queda cubierta automáticamente.
    const proto = AuthController.prototype as unknown as Record<string, unknown>;
    const postPaths = Object.getOwnPropertyNames(proto)
      .map((name) => proto[name])
      .filter((fn): fn is object => typeof fn === 'function' && fn !== AuthController)
      .filter((fn) => Reflect.getMetadata(METHOD_METADATA, fn) === RequestMethod.POST)
      .map((fn) => String(Reflect.getMetadata(PATH_METADATA, fn)));
    expect(postPaths.sort()).toEqual(['activate', 'login', 'logout', 'password/forgot', 'password/reset', 'refresh', 'register', 'resend-verification', 'verify-email']);

    for (const path of postPaths) {
      for (const origin of [undefined, 'null', 'https://evil.example.test', 'http://localhost:5174', `${ORIGIN}.evil.test`]) {
        let req = h
          .http()
          .post(`/api/v1/auth/${path}`)
          .set('Authorization', bearer(tokens.docenteA))
          .set('Host', 'localhost:5173')
          .set('X-Forwarded-Host', 'localhost:5173');
        if (origin !== undefined) req = req.set('Origin', origin);
        const res = await req.send({});
        expect({ path, origin, status: res.status }).toEqual({ path, origin, status: 403 });
        expect(res.body).toMatchObject({ type: 'urn:omr-preicfes:problema:origen-no-permitido' });
      }
    }
    // El token usado sigue vigente: ningún 403 tuvo efectos (logout no revocó la sesión).
    await get('/api/v1/auth/me', tokens.docenteA).expect(200);
  });

  it('CORS: origen exacto con credenciales, nunca *; origen ajeno sin cabeceras CORS (DEC-20)', async () => {
    const ok = await h
      .http()
      .options('/api/v1/auth/login')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(ok.status).toBeLessThan(300);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');

    const foreign = await h
      .http()
      .options('/api/v1/auth/login')
      .set('Origin', 'https://evil.example.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();

    const simple = await get('/api/v1/health').set('Origin', ORIGIN).expect(200);
    expect(simple.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(simple.headers['access-control-allow-origin']).not.toBe('*');
  });
});
