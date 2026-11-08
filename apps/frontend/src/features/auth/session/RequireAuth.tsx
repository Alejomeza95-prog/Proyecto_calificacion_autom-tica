import { useEffect, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ROUTES } from '../../../app/routes.ts';
import { AuthPage } from '../components/AuthPage.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { forgetReturnPath, rememberReturnPath } from './safe-return.ts';
import { useSession } from './session-context.ts';

interface RequireAuthProps {
  readonly children: ReactNode;
}

/**
 * Solo decide qué se muestra: la autorización sigue siendo del backend (RN-08). Exige sesión y cuenta ACTIVA.
 * Sin decidir todavía, no muestra contenido privado; si el servicio no responde, no trata a la persona como
 * desconectada (plan §2.4).
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { session, retry } = useSession();
  const { pathname } = useLocation();

  const allowed = session.estado === 'autenticada' && session.usuario.estado === 'ACTIVA';
  const denied = session.estado === 'anonima' || (session.estado === 'autenticada' && !allowed);
  // Tras un cierre voluntario no hay nada a lo que volver.
  const leftOnPurpose = session.estado === 'anonima' && session.motivo === 'cierre-de-sesion';

  useEffect(() => {
    if (allowed) forgetReturnPath();
    else if (leftOnPurpose) forgetReturnPath();
    else if (denied) rememberReturnPath(pathname);
  }, [allowed, denied, leftOnPurpose, pathname]);

  if (allowed) return children;
  if (denied) return <Navigate to={ROUTES.iniciarSesion} replace />;

  if (session.estado === 'comprobando') {
    return (
      <AuthPage flow="acceso" title="Comprobando tu sesión">
        <StatusMessage tone="info">Un momento, por favor.</StatusMessage>
      </AuthPage>
    );
  }

  function handleRetry(event: FormEvent) {
    event.preventDefault();
    retry();
  }

  return (
    <AuthPage flow="acceso" title="Servicio no disponible">
      <form onSubmit={handleRetry} noValidate>
        <StatusMessage tone="error">
          No pudimos comprobar tu sesión porque el servicio no responde. No se cerró tu sesión: inténtalo de nuevo.
        </StatusMessage>
        <SubmitButton pendingLabel="Comprobando…">Reintentar</SubmitButton>
      </form>
    </AuthPage>
  );
}
