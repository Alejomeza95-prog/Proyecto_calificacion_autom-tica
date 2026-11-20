import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { AppRoutes } from '../app/router.tsx';
import type { Role } from '../features/auth/api/types.ts';
import { createSessionController, type SessionController } from '../features/auth/session/session-controller.ts';
import { SessionProvider } from '../features/auth/session/SessionProvider.tsx';
import { granted, installFakeAuthApi, json, USER } from './fake-auth-api.ts';

/** Solo para pruebas de HT-AUTH-03: aplicación completa con una sesión ACTIVA del rol indicado. */
export const controllers: SessionController[] = [];

export const currentRoute = () => screen.getByTestId('ruta').textContent;

type Handlers = Parameters<typeof installFakeAuthApi>[0];

export function sessionHandlers(rol: Role, institucionId: string | null = rol === 'ADMIN' ? null : USER.institucionId): Handlers {
  return {
    'POST /refresh': () => granted('token-de-prueba'),
    'GET /me': () => json(200, { ...USER, rol, institucionId }),
  };
}

/** Instala el `fetch` falso con la sesión del rol y las rutas de la API indicadas, y renderiza en `path`. */
export function renderApp(path: string, rol: Role, api: Handlers = {}) {
  const fake = installFakeAuthApi({ ...sessionHandlers(rol), ...api });
  const controller = createSessionController();
  controllers.push(controller);
  const Where = () => <span data-testid="ruta">{useLocation().pathname}</span>;
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider controller={controller}>
        <AppRoutes />
        <Where />
      </SessionProvider>
    </MemoryRouter>,
  );
  return fake;
}

export function disposeControllers(): void {
  controllers.splice(0).forEach((c) => c.dispose());
}
