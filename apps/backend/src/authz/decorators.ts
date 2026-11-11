import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { ProblemException, ProblemType } from '../common/http/problem';
import type { Role } from './role';
import type { AuthenticatedRequest, Principal } from './principal';

export const IS_PUBLIC = 'omr:auth:public';
export const REQUIRED_ROLES = 'omr:auth:roles';
export const ANY_ACTIVE_ROLE = 'omr:auth:any-active-role';
export const ORIGIN_PROTECTED = 'omr:auth:origin-protected';

/** Ruta sin `JwtAuthGuard` (plan §11). Debe declararse de forma explícita en cada ruta pública. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Roles permitidos en la ruta (`RolesGuard`, DEC-11, DEC-29). Exige al menos un rol. En la clase y en el
 * método se combinan por **intersección**: un método nunca amplía lo que concede la clase.
 */
export const Roles = (first: Role, ...rest: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, [first, ...rest]);

/**
 * Cualquier cuenta ACTIVA autenticada con un rol del catálogo (DEC-29). Política explícita para rutas como
 * `/auth/me` o `/auth/logout`: sin `@Roles()` ni `@AnyActiveRole()`, `RolesGuard` deniega (403).
 * Combinada con `@Roles()` en el otro nivel, rige la lista de roles.
 */
export const AnyActiveRole = (): MethodDecorator & ClassDecorator => SetMetadata(ANY_ACTIVE_ROLE, true);

/**
 * Controlador cuyas rutas que cambian estado exigen un `Origin` permitido (`OriginGuard`, DEC-20).
 * Se aplica a nivel de clase en el controlador de `/api/v1/auth`.
 */
export const OriginProtected = (): ClassDecorator => SetMetadata(ORIGIN_PROTECTED, true);

/** Principal autenticado construido por `JwtAuthGuard` desde el documento `usuarios`. */
export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const principal = ctx.switchToHttp().getRequest<AuthenticatedRequest>().principal;
  if (!principal) throw new ProblemException(401, ProblemType.NO_AUTENTICADO);
  return principal;
});
