import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { isLinkTokenRoute } from '../../../app/routes.ts';
import { SessionContext, type SessionContextValue } from './session-context.ts';
import { sessionController, type SessionController } from './session-controller.ts';

interface SessionProviderProps {
  readonly children: ReactNode;
  readonly controller?: SessionController;
}

/**
 * Publica el estado de sesión y lo restaura al cargar. Las rutas con token no lo necesitan (plan §2.4):
 * se restaura al salir de ellas.
 */
export function SessionProvider({ children, controller = sessionController }: SessionProviderProps) {
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { pathname } = useLocation();
  const needsSession = !isLinkTokenRoute(pathname);

  useEffect(() => {
    if (needsSession) controller.ensureRestored();
  }, [controller, needsSession]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, login: controller.login, logout: controller.logout, retry: controller.retry }),
    [controller, session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
