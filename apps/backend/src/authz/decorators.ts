import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { ProblemException, ProblemType } from '../common/http/problem';
import type { Role } from './role';
import type { AuthenticatedRequest, Principal } from './principal';

export const IS_PUBLIC = 'omr:auth:public';
export const REQUIRED_ROLES = 'omr:auth:roles';
export const ORIGIN_PROTECTED = 'omr:auth:origin-protected';

/** Ruta sin `JwtAuthGuard` (plan §11). Debe declararse de forma explícita en cada ruta pública. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** Roles permitidos en la ruta (`RolesGuard`, DEC-11). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_ROLES, roles);

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
