import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ANY_ACTIVE_ROLE, IS_PUBLIC, REQUIRED_ROLES } from './decorators';
import { ROLES, type Role } from './role';

/** Motivo de una política que deniega a todos (DEC-29). */
export type DenyReason = 'SIN_POLITICA' | 'POLITICA_CONTRADICTORIA' | 'INTERSECCION_VACIA';

/**
 * Política efectiva de una ruta (DEC-29):
 * - `public`: `@Public()` sin política de roles; `RolesGuard` no exige principal.
 * - `roles`: roles permitidos (intersección de clase y método); `public` indica que además es `@Public()`,
 *   en cuyo caso falta el principal y la ruta responde 401 (falla en cerrado).
 * - `deny`: nadie pasa (403).
 */
export type RoutePolicy =
  | { readonly kind: 'public' }
  | { readonly kind: 'roles'; readonly roles: readonly Role[]; readonly public: boolean }
  | { readonly kind: 'deny'; readonly reason: DenyReason };

type LevelPolicy =
  | { readonly kind: 'none' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'roles'; readonly roles: readonly Role[] };

/** Destinos de metadatos de Nest: el método (`getHandler()`) o la clase (`getClass()`). */
type HandlerTarget = ReturnType<ExecutionContext['getHandler']>;
type ControllerTarget = ReturnType<ExecutionContext['getClass']>;
type MetadataTarget = HandlerTarget | ControllerTarget;

/** Política declarada en un solo nivel (clase o método). `@AnyActiveRole()` equivale al catálogo completo. */
function levelPolicy(reflector: Reflector, target: MetadataTarget): LevelPolicy {
  const roles = reflector.get<Role[] | undefined>(REQUIRED_ROLES, target);
  const any = reflector.get<boolean | undefined>(ANY_ACTIVE_ROLE, target) === true;
  if (roles !== undefined && any) return { kind: 'conflict' };
  if (roles !== undefined) return { kind: 'roles', roles: Array.isArray(roles) ? roles : [] };
  if (any) return { kind: 'roles', roles: ROLES };
  return { kind: 'none' };
}

/**
 * Resuelve la política de una ruta (DEC-29). Lee la clase y el método **por separado** (no
 * `getAllAndOverride`) y combina por intersección, de modo que un método nunca amplía la clase.
 * Lo usan `RolesGuard` y la prueba de inventario de rutas.
 */
export function resolveRoutePolicy(reflector: Reflector, handler: HandlerTarget, controller: ControllerTarget): RoutePolicy {
  const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [handler, controller]) === true;
  const levels = [levelPolicy(reflector, controller), levelPolicy(reflector, handler)];

  if (levels.some((l) => l.kind === 'conflict')) return { kind: 'deny', reason: 'POLITICA_CONTRADICTORIA' };
  const declared = levels.filter((l): l is Extract<LevelPolicy, { kind: 'roles' }> => l.kind === 'roles');
  if (declared.length === 0) return isPublic ? { kind: 'public' } : { kind: 'deny', reason: 'SIN_POLITICA' };

  const allowed = ROLES.filter((rol) => declared.every((l) => l.roles.includes(rol)));
  if (allowed.length === 0) return { kind: 'deny', reason: 'INTERSECCION_VACIA' };
  return { kind: 'roles', roles: allowed, public: isPublic };
}
