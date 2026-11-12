import { Controller, Get, Post, type ExecutionContext, type Type } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import type { Clock } from '../common/clock';
import { ProblemException } from '../common/http/problem';
import { loadAuthConfig, type AuthConfig } from '../config/auth-config';
import { AccountStatus } from '../users/account-status';
import { AccessTokenService } from './access-token.service';
import { AuthController } from '../auth/auth.controller';
import { HealthController } from '../health/health.controller';
import { AnyActiveRole, OriginProtected, Public, Roles } from './decorators';
import { OriginGuard, RolesGuard } from './guards';
import { resolveRoutePolicy } from './route-policy';
import { InstitutionScopePolicy } from './institution-scope.policy';
import type { Principal } from './principal';
import { Role } from './role';

const ALLOWED = 'http://localhost:5173';

function config(overrides: Record<string, string> = {}): AuthConfig {
  // Configuración mínima válida para las pruebas unitarias (sin conexiones reales).
  const env: Record<string, string> = {
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost:27017/x',
    REDIS_URL: 'redis://localhost:6379',
    APP_PUBLIC_URL: ALLOWED,
    AUTH_ALLOWED_ORIGINS: `${ALLOWED},https://app.example.test`,
    JWT_ACCESS_SECRET: 'x'.repeat(48),
    JWT_ACCESS_TTL: '15m',
    SESSION_REFRESH_TTL: '7d',
    VERIFY_TOKEN_TTL: '24h',
    RESET_TOKEN_TTL: '30m',
    ACTIVATION_TOKEN_TTL: '24h',
    AUTH_MIN_RESPONSE_MS: '10',
    RATE_LIMIT_KEY_PEPPER: 'p'.repeat(48),
    RATE_LIMIT_REDIS_TIMEOUT_MS: '200',
    TRUST_PROXY_HOPS: '0',
    SESSION_MAX_ROTATIONS: '1000',
    AUTH_OVERLOAD_RETRY_AFTER_S: '5',
    ARGON2_MAX_CONCURRENCY: '2',
    ARGON2_QUEUE_MAX: '4',
    ARGON2_QUEUE_TIMEOUT_MS: '1000',
    UV_THREADPOOL_SIZE: '4',
    CAPTCHA_PROVIDER: 'test',
    CAPTCHA_VERIFY_TIMEOUT_MS: '200',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    SMTP_CONNECTION_TIMEOUT_MS: '1000',
    SMTP_GREETING_TIMEOUT_MS: '1000',
    SMTP_SOCKET_TIMEOUT_MS: '1000',
    MAIL_FROM: 'no-responder@example.test',
    MAIL_DRAIN_TIMEOUT_MS: '1000',
    METRICS_PORT: '0',
    METRICS_HOST: '127.0.0.1',
    AUDIT_IP_PEPPER: 'a'.repeat(48),
    ...overrides,
  };
  for (const rule of [
    'LOGIN_IP_FAILURE',
    'LOGIN_CHALLENGE_IP',
    'LOGIN_CHALLENGE_ACCOUNT',
    'REGISTER_EMAIL',
    'REGISTER_IP',
    'RESEND_ACCOUNT',
    'RESEND_IP',
    'VERIFY_TOKEN',
    'VERIFY_IP',
    'FORGOT_ACCOUNT',
    'FORGOT_IP',
    'RESET_TOKEN',
    'RESET_IP',
    'ACTIVATE_TOKEN',
    'ACTIVATE_IP',
    'AUTH_GLOBAL',
  ]) {
    env[`RATE_LIMIT_${rule}`] ??= '5/15m';
  }
  return loadAuthConfig(env);
}

@OriginProtected()
@Controller('auth')
class ProtectedController {
  @Public()
  @Post('login')
  login(): void {}

  @Get('me')
  me(): void {}
}

@Controller('otro')
class UnprotectedController {
  @Post('x')
  x(): void {}

  @Roles(Role.ADMIN)
  @Get('admin')
  admin(): void {}

  @Roles(Role.COORDINADOR, Role.DOCENTE)
  @Get('institucional')
  institucional(): void {}
}

function httpContext(
  controller: Type,
  handler: string,
  request: { method: string; headers?: Record<string, string | string[]>; principal?: Principal },
): ExecutionContext {
  const proto = controller.prototype as Record<string, unknown>;
  const fn = proto[handler];
  if (typeof fn !== 'function') throw new Error(`sin método ${handler}`);
  const req = { headers: {}, ...request };
  return {
    getType: () => 'http',
    getClass: () => controller,
    getHandler: () => fn,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}), getNext: () => undefined }),
  } as unknown as ExecutionContext;
}

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof ProblemException ? error.getStatus() : -1;
  }
}

function principal(rol: Role | null, institucionId: Types.ObjectId | null): Principal {
  return {
    id: new Types.ObjectId(),
    sid: new Types.ObjectId(),
    nombre: 'Persona de prueba',
    rol,
    institucionId,
    estado: AccountStatus.ACTIVA,
  };
}

// T-19 / RNF-06 / DEC-20.
describe('OriginGuard (DEC-20)', () => {
  const guard = new OriginGuard(new Reflector(), config());
  const post = (headers: Record<string, string | string[]>) =>
    statusOf(() => guard.canActivate(httpContext(ProtectedController, 'login', { method: 'POST', headers })));

  it('Origin permitido por igualdad exacta → pasa', () => {
    expect(post({ origin: ALLOWED })).toBeUndefined();
    expect(post({ origin: 'https://app.example.test' })).toBeUndefined();
  });

  it.each([
    ['ausente', {}],
    ['null', { origin: 'null' }],
    ['otro puerto', { origin: 'http://localhost:5174' }],
    ['otro esquema', { origin: 'https://localhost:5173' }],
    ['sufijo', { origin: 'https://app.example.test.evil.test' }],
    ['prefijo', { origin: 'https://evil-app.example.test' }],
    ['con ruta', { origin: `${ALLOWED}/` }],
    ['mayúsculas', { origin: 'HTTP://LOCALHOST:5173' }],
    ['comodín', { origin: '*' }],
    ['vacío', { origin: '' }],
    ['repetido', { origin: [ALLOWED, ALLOWED] }],
  ])('Origin %s → 403', (_, headers) => {
    expect(post(headers)).toBe(403);
  });

  it('Host y X-Forwarded-Host no influyen', () => {
    expect(post({ host: 'localhost:5173', 'x-forwarded-host': 'localhost:5173' })).toBe(403);
    expect(post({ origin: ALLOWED, host: 'evil.test', 'x-forwarded-host': 'evil.test' })).toBeUndefined();
  });

  it('GET, HEAD y OPTIONS no se comprueban; rutas fuera de /auth tampoco', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(statusOf(() => guard.canActivate(httpContext(ProtectedController, 'me', { method })))).toBeUndefined();
    }
    expect(statusOf(() => guard.canActivate(httpContext(UnprotectedController, 'x', { method: 'POST' })))).toBeUndefined();
  });
});

// T-49 (DEC-29): controladores de prueba para la política de RolesGuard.
@Controller('politicas')
class PolicyController {
  @Get('sin-politica')
  sinPolitica(): void {}

  @AnyActiveRole()
  @Get('cualquiera')
  cualquiera(): void {}

  @Roles(Role.ADMIN)
  @AnyActiveRole()
  @Get('contradictoria')
  contradictoria(): void {}

  @Public()
  @Get('publica')
  publica(): void {}

  @Public()
  @Roles(Role.ADMIN)
  @Get('publica-con-roles')
  publicaConRoles(): void {}
}

@Roles(Role.ADMIN)
@Controller('admin')
class AdminOnlyController {
  @Get('heredada')
  heredada(): void {}

  @Roles(Role.DOCENTE)
  @Get('metodo-docente')
  metodoDocente(): void {}

  @Roles(Role.ADMIN, Role.DOCENTE)
  @Get('metodo-admin-docente')
  metodoAdminDocente(): void {}

  @AnyActiveRole()
  @Get('metodo-cualquiera')
  metodoCualquiera(): void {}
}

@AnyActiveRole()
@Controller('general')
class AnyRoleController {
  @Get('heredada')
  heredada(): void {}

  @Roles(Role.ADMIN)
  @Get('solo-admin')
  soloAdmin(): void {}
}

@Roles(Role.COORDINADOR, Role.DOCENTE)
@Controller('institucional')
class InstitutionalController {
  @Roles(Role.DOCENTE)
  @Get('docente')
  docente(): void {}

  @Roles(Role.ADMIN)
  @Get('admin')
  admin(): void {}
}

describe('RolesGuard (DEC-11, DEC-14, DEC-29)', () => {
  const guard = new RolesGuard(new Reflector());
  const inst = new Types.ObjectId();
  const PRINCIPALS: Readonly<Record<Role, Principal>> = {
    ADMIN: principal(Role.ADMIN, null),
    COORDINADOR: principal(Role.COORDINADOR, inst),
    DOCENTE: principal(Role.DOCENTE, inst),
  };
  const check = (controller: Type, handler: string, p?: Principal) =>
    statusOf(() => guard.canActivate(httpContext(controller, handler, { method: 'GET', ...(p ? { principal: p } : {}) })));
  /** Roles del catálogo que pasan el guard en la ruta; el resto debe recibir exactamente 403. */
  const allowed = (controller: Type, handler: string): Role[] =>
    (Object.keys(PRINCIPALS) as Role[]).filter((rol) => {
      const status = check(controller, handler, PRINCIPALS[rol]);
      if (status !== undefined) expect(status).toBe(403);
      return status === undefined;
    });

  it('rol permitido → pasa; rol insuficiente → 403; sin principal → 401; cuenta sin rol → 403', () => {
    expect(allowed(UnprotectedController, 'admin')).toEqual([Role.ADMIN]);
    expect(allowed(UnprotectedController, 'institucional')).toEqual([Role.COORDINADOR, Role.DOCENTE]);
    expect(check(UnprotectedController, 'admin', principal(null, null))).toBe(403);
    expect(check(UnprotectedController, 'admin')).toBe(401);
  });

  it('ruta protegida sin metadatos de autorización → 403 para todos, también sin principal (denegación por defecto)', () => {
    expect(allowed(UnprotectedController, 'x')).toEqual([]);
    expect(allowed(PolicyController, 'sinPolitica')).toEqual([]);
    expect(check(PolicyController, 'sinPolitica')).toBe(403);
  });

  it('@AnyActiveRole() → pasa para ADMIN, COORDINADOR y DOCENTE; sin rol → 403; sin principal → 401', () => {
    expect(allowed(PolicyController, 'cualquiera')).toEqual([Role.ADMIN, Role.COORDINADOR, Role.DOCENTE]);
    expect(check(PolicyController, 'cualquiera', principal(null, null))).toBe(403);
    expect(check(PolicyController, 'cualquiera')).toBe(401);
  });

  it('clase ADMIN + método DOCENTE → intersección vacía: 403 para todos (el método no amplía la clase)', () => {
    expect(allowed(AdminOnlyController, 'metodoDocente')).toEqual([]);
  });

  it('clase ADMIN: el método hereda, restringe o declara cualquier rol, pero nunca amplía', () => {
    expect(allowed(AdminOnlyController, 'heredada')).toEqual([Role.ADMIN]);
    expect(allowed(AdminOnlyController, 'metodoAdminDocente')).toEqual([Role.ADMIN]);
    expect(allowed(AdminOnlyController, 'metodoCualquiera')).toEqual([Role.ADMIN]);
  });

  it('clase @AnyActiveRole(): el método hereda o restringe; ADMIN conserva sus permisos', () => {
    expect(allowed(AnyRoleController, 'heredada')).toEqual([Role.ADMIN, Role.COORDINADOR, Role.DOCENTE]);
    expect(allowed(AnyRoleController, 'soloAdmin')).toEqual([Role.ADMIN]);
  });

  it('clase institucional: el método restringe a DOCENTE; un método ADMIN no se concede a nadie', () => {
    expect(allowed(InstitutionalController, 'docente')).toEqual([Role.DOCENTE]);
    expect(allowed(InstitutionalController, 'admin')).toEqual([]);
  });

  it('@Roles y @AnyActiveRole en el mismo nivel → política contradictoria: 403 para todos', () => {
    expect(allowed(PolicyController, 'contradictoria')).toEqual([]);
  });

  it('rutas públicas: sin política pasan sin principal; con @Roles exigen principal (401, falla en cerrado)', () => {
    expect(check(PolicyController, 'publica')).toBeUndefined();
    expect(check(ProtectedController, 'login')).toBeUndefined();
    expect(check(PolicyController, 'publicaConRoles')).toBe(401);
    expect(allowed(PolicyController, 'publicaConRoles')).toEqual([Role.ADMIN]);
  });

  it('resolveRoutePolicy informa el motivo de cada denegación', () => {
    const reflector = new Reflector();
    const policy = (controller: Type, handler: string) =>
      resolveRoutePolicy(reflector, (controller.prototype as Record<string, () => void>)[handler], controller);
    expect(policy(PolicyController, 'sinPolitica')).toEqual({ kind: 'deny', reason: 'SIN_POLITICA' });
    expect(policy(PolicyController, 'contradictoria')).toEqual({ kind: 'deny', reason: 'POLITICA_CONTRADICTORIA' });
    expect(policy(AdminOnlyController, 'metodoDocente')).toEqual({ kind: 'deny', reason: 'INTERSECCION_VACIA' });
    expect(policy(PolicyController, 'publica')).toEqual({ kind: 'public' });
  });
});

/** Rutas (métodos con `@Get`, `@Post`, …) declaradas en un controlador. */
function routeHandlers(controller: Type): string[] {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((name) => {
    const fn = proto[name];
    return name !== 'constructor' && typeof fn === 'function' && Reflect.getMetadata(PATH_METADATA, fn) !== undefined;
  });
}

// T-49 (DEC-29): inventario de los controladores reales de la API. El E2E de seguridad recorre además todos
// los controladores registrados en la aplicación.
describe('inventario de políticas de los controladores de la API (DEC-29)', () => {
  const reflector = new Reflector();
  const policyOf = (controller: Type, handler: string) =>
    resolveRoutePolicy(reflector, (controller.prototype as Record<string, () => void>)[handler], controller);

  it('cada ruta declara política y ninguna combinación de clase y método es contradictoria', () => {
    for (const controller of [AuthController, HealthController] as Type[]) {
      const handlers = routeHandlers(controller);
      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        expect({ ruta: `${controller.name}.${handler}`, policy: policyOf(controller, handler) }).not.toMatchObject({
          policy: { kind: 'deny' },
        });
      }
    }
  });

  it('/auth/me y /auth/logout admiten cualquier cuenta ACTIVA; el resto de /auth y /health son públicas', () => {
    const everyRole = { kind: 'roles', roles: [Role.ADMIN, Role.COORDINADOR, Role.DOCENTE], public: false };
    expect(policyOf(AuthController, 'me')).toEqual(everyRole);
    expect(policyOf(AuthController, 'logout')).toEqual(everyRole);
    for (const handler of routeHandlers(AuthController).filter((h) => h !== 'me' && h !== 'logout')) {
      expect(policyOf(AuthController, handler)).toEqual({ kind: 'public' });
    }
    expect(policyOf(HealthController, 'check')).toEqual({ kind: 'public' });
  });
});

describe('InstitutionScopePolicy (RN-17, DEC-14)', () => {
  const policy = new InstitutionScopePolicy();
  const a = new Types.ObjectId();
  const b = new Types.ObjectId();

  it('ADMIN: alcance global, sin filtro', () => {
    expect(policy.scopeFilter(principal(Role.ADMIN, null))).toEqual({});
    expect(policy.scoped(principal(Role.ADMIN, null), { x: 1 })).toEqual({ x: 1 });
    expect(statusOf(() => policy.assertInScope(principal(Role.ADMIN, null), b))).toBeUndefined();
  });

  it('DOCENTE/COORDINADOR: filtro por su institución combinado con $and', () => {
    const docente = principal(Role.DOCENTE, a);
    expect(policy.scopeFilter(docente)).toEqual({ institucion_id: a });
    // El filtro de la operación no puede reemplazar la condición de institución.
    expect(policy.scoped(docente, { institucion_id: b })).toEqual({ $and: [{ institucion_id: b }, { institucion_id: a }] });
  });

  it('recurso de otra institución o sin institución → 404; de la propia → pasa', () => {
    expect(statusOf(() => policy.assertInScope(principal(Role.COORDINADOR, a), b))).toBe(404);
    expect(statusOf(() => policy.assertInScope(principal(Role.COORDINADOR, a), null))).toBe(404);
    expect(statusOf(() => policy.assertInScope(principal(Role.COORDINADOR, a), a))).toBeUndefined();
  });

  it('rol institucional sin institución o cuenta sin rol → 403 siempre', () => {
    expect(statusOf(() => policy.scopeFilter(principal(Role.DOCENTE, null)))).toBe(403);
    expect(statusOf(() => policy.scopeFilter(principal(null, null)))).toBe(403);
  });
});

class StepClock implements Clock {
  constructor(public t: number) {}
  now(): Date {
    return new Date(this.t);
  }
}

describe('AccessTokenService (DEC-01, CA-15)', () => {
  const cfg = config();
  const clock = new StepClock(Date.UTC(2026, 10, 4, 12, 0, 0));
  const service = new AccessTokenService(new JwtService({}), cfg, clock);
  const user = new Types.ObjectId();
  const sid = new Types.ObjectId();

  it('emite claims sub, sid y cv sin rol ni institución; vence a JWT_ACCESS_TTL', async () => {
    const issued = service.issue(user, sid, 3);
    expect(issued.expiresIn).toBe(15 * 60);
    const claims = await service.verify(issued.accessToken);
    expect(claims).toMatchObject({ sub: user.toHexString(), sid: sid.toHexString(), cv: 3 });
    expect(Object.keys(claims ?? {}).sort()).toEqual(['cv', 'exp', 'iat', 'sid', 'sub']);

    clock.t += 15 * 60 * 1_000 - 1_000;
    await expect(service.verify(issued.accessToken)).resolves.not.toBeNull();
    clock.t += 2_000; // 15 min + 1 s
    await expect(service.verify(issued.accessToken)).resolves.toBeNull();
  });

  it('firma con otro secreto, algoritmo none o token alterado → null', async () => {
    const other = new AccessTokenService(new JwtService({}), config({ JWT_ACCESS_SECRET: 'y'.repeat(48) }), clock);
    const foreign = other.issue(user, sid, 0).accessToken;
    await expect(service.verify(foreign)).resolves.toBeNull();

    const [, payload] = service.issue(user, sid, 0).accessToken.split('.');
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    await expect(service.verify(none)).resolves.toBeNull();
    await expect(service.verify('a.b.c')).resolves.toBeNull();
  });
});
