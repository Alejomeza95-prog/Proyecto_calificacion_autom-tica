import { Inject, Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { singleHeader } from '../common/http/http-types';
import { ProblemException, ProblemType } from '../common/http/problem';
import { SessionsService } from '../sessions/sessions.service';
import { AccountStatus } from '../users/account-status';
import { UsersService } from '../users/users.service';
import { AccessTokenService } from './access-token.service';
import { IS_PUBLIC, ORIGIN_PROTECTED } from './decorators';
import type { AuthenticatedRequest } from './principal';
import { roleInstitutionViolation } from './role';
import { resolveRoutePolicy } from './route-policy';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function unauthenticated(): ProblemException {
  return new ProblemException(401, ProblemType.NO_AUTENTICADO);
}

/**
 * Validación estricta de `Origin` (DEC-20, RNF-06). Se registra **antes** que los demás guards para
 * rechazar sin efectos (sin consumir contadores ni tokens, sin rotar cookies ni revocar sesiones).
 * Aplica a los métodos que cambian estado de los controladores marcados con `@OriginProtected()`.
 * Compara la cabecera completa por igualdad exacta con `AUTH_ALLOWED_ORIGINS` (ya normalizada al
 * arrancar); `null`, ausente, repetida, parcial o con otro esquema o puerto → 403. No usa `Host` ni
 * `X-Forwarded-Host`.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: ReadonlySet<string>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_CONFIG) config: AuthConfig,
  ) {
    this.allowed = new Set(config.authAllowedOrigins);
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const protectedRoute = this.reflector.getAllAndOverride<boolean | undefined>(ORIGIN_PROTECTED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!protectedRoute) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
    const origin = singleHeader(request.headers.origin);
    if (origin === undefined || !this.allowed.has(origin)) {
      throw new ProblemException(403, ProblemType.ORIGEN_NO_PERMITIDO);
    }
    return true;
  }
}

/**
 * Autenticación global (plan §11, DEC-01, DEC-10, RN-07, RN-16). Salvo `@Public()`:
 * 1) JWT `Bearer` con firma, algoritmo y vencimiento válidos;
 * 2) `sid` vigente en `sesiones` (no revocada ni vencida) con `version_credenciales` = claim `cv` y del
 *    mismo usuario;
 * 3) usuario ACTIVA con `version_credenciales` = `cv`.
 * El principal se construye desde `usuarios`. Cualquier fallo → 401 genérico. Un COORDINADOR o
 * DOCENTE sin institución (o una cuenta sin rol) se rechaza siempre con 403 (RN-15).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = singleHeader(request.headers.authorization);
    const match = authorization ? /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization) : null;
    if (!match?.[1]) throw unauthenticated();

    const claims = await this.tokens.verify(match[1]);
    if (!claims) throw unauthenticated();

    const session = await this.sessions.findValid(claims.sid, claims.cv);
    if (!session || session.usuarioId.toHexString() !== claims.sub) throw unauthenticated();

    const user = await this.users.findById(claims.sub);
    if (!user || user.estado !== AccountStatus.ACTIVA || user.version_credenciales !== claims.cv) {
      throw unauthenticated();
    }

    request.principal = {
      id: user._id,
      sid: session.sid,
      nombre: user.nombre,
      rol: user.rol,
      institucionId: user.institucion_id,
      estado: user.estado,
    };
    if (roleInstitutionViolation(user.estado, user.rol, user.institucion_id)) {
      throw new ProblemException(403, ProblemType.ACCESO_DENEGADO);
    }
    return true;
  }
}

/**
 * Autorización por rol con **denegación por defecto** (DEC-11, DEC-29); rol insuficiente → 403 (DEC-14).
 * - `@Public()` sin política de roles → pasa (rutas públicas).
 * - Ruta protegida sin `@Roles()` ni `@AnyActiveRole()`, política contradictoria en un mismo nivel o
 *   intersección vacía entre clase y método → 403 para todos, con aviso en el log (sin datos personales).
 * - Si no: el rol del principal (leído de `usuarios`) debe estar en la intersección de clase y método.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const handler = context.getHandler();
    const controller = context.getClass();
    const policy = resolveRoutePolicy(this.reflector, handler, controller);
    if (policy.kind === 'public') return true;
    if (policy.kind === 'deny') {
      this.logger.warn(`Ruta ${controller.name}.${handler.name} denegada por su política de roles: ${policy.reason}`);
      throw new ProblemException(403, ProblemType.ACCESO_DENEGADO);
    }
    const { principal } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!principal) throw unauthenticated();
    if (principal.rol === null || !policy.roles.includes(principal.rol)) {
      throw new ProblemException(403, ProblemType.ACCESO_DENEGADO);
    }
    return true;
  }
}
