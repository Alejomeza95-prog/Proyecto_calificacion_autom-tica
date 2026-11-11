import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { ROUTES } from '../../app/routes.ts';
import type { Role } from '../auth/api/types.ts';
import { useSession } from '../auth/session/session-context.ts';
import { hasRole } from './permissions.ts';

interface RequireRoleProps {
  readonly roles: readonly Role[];
  readonly children: ReactNode;
}

/**
 * Va dentro de `RequireAuth`. Un rol sin permiso que escribe la dirección de una opción oculta vuelve a
 * `/inicio` sin ver su contenido (CA-04). Solo decide qué se muestra: el backend responde 403 igualmente (RN-05).
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { session } = useSession();
  if (session.estado !== 'autenticada') return null;
  if (!hasRole(session.usuario.rol, roles)) return <Navigate to={ROUTES.inicio} replace />;
  return children;
}
