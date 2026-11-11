import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { granted, installFakeAuthApi, meOk, noContent, problem, USER } from '../../../test/fake-auth-api.ts';
import { useSession } from './session-context.ts';
import { createSessionController, type SessionController } from './session-controller.ts';
import { SessionProvider } from './SessionProvider.tsx';

const controllers: SessionController[] = [];

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.unstubAllGlobals();
});

function Probe() {
  const { session, retry, logout } = useSession();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="estado">{session.estado}</output>
      {session.estado === 'autenticada' && <p>{session.usuario.nombre}</p>}
      <button onClick={retry}>Reintentar</button>
      <button onClick={() => void logout()}>Cerrar</button>
      <button onClick={() => void navigate('/iniciar-sesion')}>Salir de la ruta</button>
    </>
  );
}

function renderProvider(path = '/inicio') {
  const controller = createSessionController();
  controllers.push(controller);
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider controller={controller}>
          <Probe />
        </SessionProvider>
      </MemoryRouter>
    </StrictMode>,
  );
  return controller;
}

describe('SessionProvider (CA-08)', () => {
  it('en StrictMode hace una sola renovación y una sola consulta de /me', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });

    renderProvider();

    expect(screen.getByTestId('estado')).toHaveTextContent('comprobando');
    expect(await screen.findByText(USER.nombre)).toBeInTheDocument();
    expect(screen.getByTestId('estado')).toHaveTextContent('autenticada');
    expect(api.count('POST /refresh')).toBe(1);
    expect(api.count('GET /me')).toBe(1);
  });

  it('sin cookie queda anónima', async () => {
    installFakeAuthApi({ 'POST /refresh': () => problem(401, 'no-autenticado') });

    renderProvider();

    expect(await screen.findByText('anonima')).toBeInTheDocument();
  });

  it('con 503 queda no-disponible, y reintentar autentica', async () => {
    installFakeAuthApi({ 'POST /refresh': [() => problem(503, 'servicio-saturado'), () => granted('jwt')], 'GET /me': meOk });

    renderProvider();
    expect(await screen.findByText('no-disponible')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Reintentar' }).click());

    expect(await screen.findByText('autenticada')).toBeInTheDocument();
  });

  it('expone el cierre de sesión', async () => {
    installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk, 'POST /logout': noContent });

    renderProvider();
    await screen.findByText('autenticada');

    act(() => screen.getByRole('button', { name: 'Cerrar' }).click());

    expect(await screen.findByText('anonima')).toBeInTheDocument();
  });

  it.each(['/verificar-correo', '/restablecer-contrasena', '/activar-cuenta'])(
    'en %s no consulta la sesión, y la restaura al salir',
    async (path) => {
      const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });

      renderProvider(path);
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.calls).toEqual([]);
      expect(screen.getByTestId('estado')).toHaveTextContent('comprobando');

      act(() => screen.getByRole('button', { name: 'Salir de la ruta' }).click());

      expect(await screen.findByText('autenticada')).toBeInTheDocument();
      expect(api.count('POST /refresh')).toBe(1);
    },
  );

  it('el token no llega al árbol de React (RN-02)', async () => {
    installFakeAuthApi({ 'POST /refresh': () => granted('jwt-secreto'), 'GET /me': meOk });
    function Spy() {
      return <output data-testid="contexto">{JSON.stringify(useSession())}</output>;
    }
    const controller = createSessionController();
    controllers.push(controller);

    render(
      <MemoryRouter>
        <SessionProvider controller={controller}>
          <Probe />
          <Spy />
        </SessionProvider>
      </MemoryRouter>,
    );
    await screen.findByText('autenticada');

    expect(screen.getByTestId('contexto')).toHaveTextContent(USER.nombre);
    expect(screen.getByTestId('contexto')).not.toHaveTextContent('jwt-secreto');
  });

  it('useSession fuera del proveedor falla con un mensaje claro', () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow('useSession debe usarse dentro de SessionProvider');

    silence.mockRestore();
  });
});
