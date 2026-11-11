import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { isLinkTokenRoute, ROUTES, SCREEN_TITLES, type ScreenKey } from './app/routes.ts';
import { installFakeAuthApi, problem } from './test/fake-auth-api.ts';

const SCREEN_KEYS = Object.keys(ROUTES) as ScreenKey[];

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    installFakeAuthApi({ 'POST /refresh': () => problem(401, 'no-autenticado') });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renderiza la raíz de la aplicación con el nombre del producto', () => {
    render(<App />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText('OMR-PreICFES')).toBeInTheDocument();
  });

  it.each(SCREEN_KEYS.filter((key) => key !== 'inicio'))('resuelve la ruta pública aprobada de %s', async (key) => {
    window.history.pushState({}, '', ROUTES[key]);

    render(<App />);

    expect(window.location.pathname).toBe(ROUTES[key]);
    expect(await screen.findByRole('heading', { level: 1, name: SCREEN_TITLES[key] })).toBeInTheDocument();
    expect(document.title).toContain(SCREEN_TITLES[key]);
  });

  it('una ruta desconocida pasa por /inicio, que sin sesión lleva a Iniciar sesión', async () => {
    window.history.pushState({}, '', '/ruta-desconocida');

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.iniciarSesion));
  });

  it('/inicio es privada: sin sesión lleva a Iniciar sesión', async () => {
    window.history.pushState({}, '', ROUTES.inicio);

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe(ROUTES.iniciarSesion));
    expect(await screen.findByRole('heading', { level: 1, name: SCREEN_TITLES.iniciarSesion })).toBeInTheDocument();
  });

  it('solo las tres rutas de los enlaces del correo se tratan como rutas con token', () => {
    expect(SCREEN_KEYS.filter((key) => isLinkTokenRoute(ROUTES[key])).sort()).toEqual(
      ['activarCuenta', 'restablecerContrasena', 'verificarCorreo'].sort(),
    );
    expect(isLinkTokenRoute('/verificar-correo/')).toBe(true);
  });

  it('solo existen las rutas aprobadas, sin aprobación ni administración (RN-14)', () => {
    expect(Object.values(ROUTES).sort()).toEqual(
      [
        '/activar-cuenta',
        '/iniciar-sesion',
        '/inicio',
        '/olvide-contrasena',
        '/reenviar-verificacion',
        '/registro',
        '/restablecer-contrasena',
        '/revisa-tu-correo',
        '/verificar-correo',
      ].sort(),
    );
  });
});
