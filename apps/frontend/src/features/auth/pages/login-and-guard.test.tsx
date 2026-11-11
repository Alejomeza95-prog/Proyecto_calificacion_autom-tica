import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '../../../app/routes.ts';
import { deferred, flush, granted, installFakeAuthApi, json, meOk, noContent, problem, USER } from '../../../test/fake-auth-api.ts';
import type { TurnstileRenderOptions } from '../captcha/turnstile-loader.ts';
import { LOGIN_GUIDANCE } from '../messages.ts';
import { RequireAuth } from '../session/RequireAuth.tsx';
import { forgetReturnPath, getReturnPath } from '../session/safe-return.ts';
import { createSessionController, type SessionController } from '../session/session-controller.ts';
import { SessionProvider } from '../session/SessionProvider.tsx';
import { HomePage } from './HomePage.tsx';
import { LoginPage } from './LoginPage.tsx';

const CORREO = 'persona@example.test';
const PASSWORD = 'una-clave-bastante-larga';
const GENERIC_TITLE = 'Correo o contraseña incorrectos';
const CAPTCHA_TOKEN = 'respuesta-del-widget';

const controllers: SessionController[] = [];

function Where() {
  return <span data-testid="ruta">{useLocation().pathname}</span>;
}

function renderAt(path: string) {
  const controller = createSessionController();
  controllers.push(controller);
  render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider controller={controller}>
          <Routes>
            <Route path={ROUTES.iniciarSesion} element={<LoginPage />} />
            <Route
              path={ROUTES.inicio}
              element={
                <RequireAuth>
                  <HomePage />
                </RequireAuth>
              }
            />
          </Routes>
          <Where />
        </SessionProvider>
      </MemoryRouter>
    </StrictMode>,
  );
  return controller;
}

function fillLogin(password = PASSWORD) {
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: CORREO } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } });
}

const submitLogin = () => fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
const route = () => screen.getByTestId('ruta').textContent;
const anonymous = { 'POST /refresh': () => problem(401, 'no-autenticado') };

function installFakeTurnstile() {
  const options: TurnstileRenderOptions[] = [];
  const api = {
    render: vi.fn((_container: HTMLElement, renderOptions: TurnstileRenderOptions) => {
      options.push(renderOptions);
      return `widget-${options.length}`;
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return { api, last: () => options.at(-1) };
}

beforeEach(() => {
  vi.stubEnv('VITE_CAPTCHA_SITE_KEY', 'sitekey-publica');
});

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  forgetReturnPath();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  delete window.turnstile;
  // Termina las cargas pendientes del cargador compartido, para que no pasen a la siguiente prueba.
  document.head.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((script) => {
    script.dispatchEvent(new Event('error'));
    script.remove();
  });
});

describe('Inicio de sesión (CA-01, CA-07, CA-15)', () => {
  it('envía correo y contraseña, sin desafío, y lleva a /inicio con los datos de /me', async () => {
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => granted('jwt'), 'GET /me': meOk });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByText(`Hola, ${USER.nombre}.`)).toBeInTheDocument();
    expect(route()).toBe(ROUTES.inicio);
    expect(screen.getByText('Tu rol: Docente')).toBeInTheDocument();
    const login = api.calls.find((call) => call.route === 'POST /login');
    expect(JSON.parse(login?.rawBody ?? '')).toEqual({ correo: CORREO, password: PASSWORD });
  });

  it('el campo de contraseña admite gestores (RNF-02)', () => {
    installFakeAuthApi(anonymous);
    renderAt(ROUTES.iniciarSesion);

    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Correo')).toHaveAttribute('autocomplete', 'email');
  });

  it('sin datos no envía y lleva el foco al primer campo', async () => {
    const api = installFakeAuthApi(anonymous);
    renderAt(ROUTES.iniciarSesion);
    await act(flush);

    submitLogin();

    expect(await screen.findByText('Escribe tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveFocus();
    expect(api.count('POST /login')).toBe(0);
  });

  it('no valida el formato del correo, igual que el backend', async () => {
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => problem(401, 'credenciales-invalidas', { title: GENERIC_TITLE }) });
    renderAt(ROUTES.iniciarSesion);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'sin-arroba' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'corta' } });
    submitLogin();

    await screen.findByRole('alert');
    expect(api.count('POST /login')).toBe(1);
  });

  it('no hay doble envío', async () => {
    const pending = deferred<Response>();
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => pending.promise, 'GET /me': meOk });
    renderAt(ROUTES.iniciarSesion);
    await act(flush);

    fillLogin();
    const button = screen.getByRole('button', { name: 'Iniciar sesión' });
    fireEvent.click(button);
    await act(flush);
    expect(button).toHaveTextContent('Entrando…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await act(flush);

    expect(api.count('POST /login')).toBe(1);
    pending.resolve(granted('jwt'));
    await screen.findByText(`Hola, ${USER.nombre}.`);
  });

  it('con sesión activa, /iniciar-sesion lleva a /inicio', async () => {
    installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': meOk });

    renderAt(ROUTES.iniciarSesion);

    expect(await screen.findByText(`Hola, ${USER.nombre}.`)).toBeInTheDocument();
    expect(route()).toBe(ROUTES.inicio);
  });

  it('volver tras una ruta privada solicitada, sin parámetros en la URL', async () => {
    installFakeAuthApi({ ...anonymous, 'POST /login': () => granted('jwt'), 'GET /me': meOk });
    renderAt(ROUTES.inicio);

    await waitFor(() => expect(route()).toBe(ROUTES.iniciarSesion));
    expect(getReturnPath()).toBe(ROUTES.inicio);
    fillLogin();
    submitLogin();

    await screen.findByText(`Hola, ${USER.nombre}.`);
    expect(route()).toBe(ROUTES.inicio);
    await waitFor(() => expect(getReturnPath()).toBeNull());
  });
});

describe('Rechazos (RN-05, RN-09, CA-05)', () => {
  it('muestra el título del backend y la orientación general, borra la contraseña y conserva el correo', async () => {
    installFakeAuthApi({ ...anonymous, 'POST /login': () => problem(401, 'credenciales-invalidas', { title: GENERIC_TITLE }) });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(GENERIC_TITLE);
    expect(alert).toHaveTextContent(LOGIN_GUIDANCE);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Correo')).toHaveValue(CORREO);
  });

  it('el rechazo no provoca renovación: nunca ante credenciales-invalidas (plan §2.4)', async () => {
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => problem(401, 'credenciales-invalidas') });
    renderAt(ROUTES.iniciarSesion);
    await act(flush);

    fillLogin();
    submitLogin();
    await screen.findByRole('alert');

    expect(api.count('POST /refresh')).toBe(1);
  });

  it.each([
    ['503 de saturación', () => problem(503, 'servicio-saturado', { retryAfter: '5' }), /no está disponible/],
    ['503 de verificación', () => problem(503, 'verificacion-no-disponible', { retryAfter: '5' }), /no está disponible/],
    ['500', () => problem(500, 'error-interno'), /Algo salió mal/],
    ['403 de origen', () => problem(403, 'origen-no-permitido'), /error de configuración/],
  ])('%s: mensaje claro y lo escrito se conserva', async (_name, response, text) => {
    installFakeAuthApi({ ...anonymous, 'POST /login': response });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByLabelText('Contraseña')).toHaveValue(PASSWORD);
  });

  it('un 429 informa la espera y bloquea el botón', async () => {
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => problem(429, 'demasiados-intentos', { retryAfter: '120' }) });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent('2 minutos');
    const button = screen.getByRole('button', { name: 'Espera para reintentar' });
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await act(flush);
    expect(api.count('POST /login')).toBe(1);
  });

  it('un 400 con errores[] marca el campo', async () => {
    installFakeAuthApi({ ...anonymous, 'POST /login': () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'correo', reglas: ['isString'] }] }) });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByText('Revisa el correo.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('isString');
  });
});

describe('Desafío de Turnstile (CA-11, RN-07, RN-10)', () => {
  const challenged = () => ({
    ...anonymous,
    'POST /login': [() => problem(401, 'desafio-requerido'), () => granted('jwt')],
    'GET /me': meOk,
  });

  it('no carga el script antes de un desafío', async () => {
    installFakeAuthApi({ ...anonymous, 'POST /login': () => problem(401, 'credenciales-invalidas') });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await screen.findByRole('alert');

    expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Verificación de seguridad' })).not.toBeInTheDocument();
  });

  it('tras el desafío carga el script en modo explícito y conserva correo y contraseña', async () => {
    installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByRole('status')).toHaveTextContent(/Completa la verificación/);
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]');
    expect(script?.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    expect(screen.getByLabelText('Contraseña')).toHaveValue(PASSWORD);
    expect(screen.getByLabelText('Correo')).toHaveValue(CORREO);
  });

  it('dibuja el widget con action login y la sitekey; reenvía con la respuesta y entra', async () => {
    const turnstile = installFakeTurnstile();
    const api = installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    expect(turnstile.last()).toMatchObject({ sitekey: 'sitekey-publica', action: 'login' });

    act(() => turnstile.last()?.callback(CAPTCHA_TOKEN));
    submitLogin();

    await screen.findByText(`Hola, ${USER.nombre}.`);
    const bodies = api.calls.filter((call) => call.route === 'POST /login').map((call) => JSON.parse(call.rawBody ?? '') as object);
    expect(bodies).toEqual([
      { correo: CORREO, password: PASSWORD },
      { correo: CORREO, password: PASSWORD, captchaToken: CAPTCHA_TOKEN },
    ]);
  });

  it('sin resolver el widget no envía nada: no hay vía alternativa', async () => {
    const turnstile = installFakeTurnstile();
    const api = installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    submitLogin();
    await act(flush);

    expect(api.count('POST /login')).toBe(1);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Completa la verificación/);
  });

  it('la respuesta rechazada pide resolver de nuevo y reinicia el widget, sin repetir el envío', async () => {
    const turnstile = installFakeTurnstile();
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => problem(401, 'desafio-requerido') });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    act(() => turnstile.last()?.callback(CAPTCHA_TOKEN));
    submitLogin();

    expect(await screen.findByText(/No pudimos validar la verificación/)).toBeInTheDocument();
    expect(turnstile.api.reset).toHaveBeenCalledTimes(1);
    await act(flush);
    expect(api.count('POST /login')).toBe(2);

    submitLogin();
    await act(flush);
    expect(api.count('POST /login')).toBe(2);
  });

  it('credenciales rechazadas con desafío: reinicia el widget, sigue visible y borra la contraseña', async () => {
    const turnstile = installFakeTurnstile();
    installFakeAuthApi({
      ...anonymous,
      'POST /login': [() => problem(401, 'desafio-requerido'), () => problem(401, 'credenciales-invalidas', { title: GENERIC_TITLE })],
    });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    act(() => turnstile.last()?.callback(CAPTCHA_TOKEN));
    submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC_TITLE);
    expect(turnstile.api.reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: 'Verificación de seguridad' })).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('el 503 de verificación mantiene el bloqueo y reinicia el widget (RN-10)', async () => {
    const turnstile = installFakeTurnstile();
    installFakeAuthApi({
      ...anonymous,
      'POST /login': [() => problem(401, 'desafio-requerido'), () => problem(503, 'verificacion-no-disponible', { retryAfter: '5' })],
    });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    act(() => turnstile.last()?.callback(CAPTCHA_TOKEN));
    submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/);
    expect(turnstile.api.reset).toHaveBeenCalledTimes(1);
    expect(route()).toBe(ROUTES.iniciarSesion);
  });

  it.each(['expired-callback', 'timeout-callback'] as const)('%s vacía la respuesta y hay que resolver de nuevo', async (callback) => {
    const turnstile = installFakeTurnstile();
    const api = installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    act(() => turnstile.last()?.callback(CAPTCHA_TOKEN));
    act(() => {
      turnstile.last()?.[callback]();
    });
    submitLogin();
    await act(flush);

    expect(api.count('POST /login')).toBe(1);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Completa la verificación/);
  });

  it('el error del widget deja el servicio no disponible y no permite continuar', async () => {
    const turnstile = installFakeTurnstile();
    const api = installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(turnstile.api.render).toHaveBeenCalled());
    act(() => {
      turnstile.last()?.['error-callback']();
    });

    expect(await screen.findByText(/No podemos completar la verificación/)).toBeInTheDocument();
    submitLogin();
    await act(flush);
    expect(api.count('POST /login')).toBe(1);
  });

  it('sin sitekey no hay widget ni vía alternativa', async () => {
    vi.stubEnv('VITE_CAPTCHA_SITE_KEY', '');
    const api = installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByText(/No podemos completar la verificación/)).toBeInTheDocument();
    expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
    submitLogin();
    await act(flush);
    submitLogin();
    await act(flush);
    expect(api.count('POST /login')).toBe(1);
  });

  it('con el script bloqueado no hay vía alternativa, y reintentar lo carga de nuevo', async () => {
    const api = installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).not.toBeNull());
    fireEvent.error(document.head.querySelector('script[src*="challenges.cloudflare.com"]') as HTMLScriptElement);

    expect(await screen.findByText(/No podemos completar la verificación/)).toBeInTheDocument();
    expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();

    submitLogin();

    await waitFor(() => expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).not.toBeNull());
    expect(api.count('POST /login')).toBe(1);
  });

  it('un script que carga sin exponer la API se trata como no disponible', async () => {
    installFakeAuthApi(challenged());
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();
    await waitFor(() => expect(document.head.querySelector('script[src*="challenges.cloudflare.com"]')).not.toBeNull());
    fireEvent.load(document.head.querySelector('script[src*="challenges.cloudflare.com"]') as HTMLScriptElement);

    expect(await screen.findByText(/No podemos completar la verificación/)).toBeInTheDocument();
  });
});

describe('Protección de rutas (CA-09, RN-08, RN-09, RN-16)', () => {
  it('mientras comprueba no muestra contenido privado', async () => {
    const pending = deferred<Response>();
    installFakeAuthApi({ 'POST /refresh': () => pending.promise, 'GET /me': meOk });

    renderAt(ROUTES.inicio);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Comprobando tu sesión');
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    pending.resolve(granted('jwt'));
    await screen.findByText(`Hola, ${USER.nombre}.`);
  });

  it('sin sesión lleva a Iniciar sesión, sin aviso y sin bucles', async () => {
    const api = installFakeAuthApi(anonymous);

    renderAt(ROUTES.inicio);

    await waitFor(() => expect(route()).toBe(ROUTES.iniciarSesion));
    await act(flush);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.routes()).toEqual(['POST /refresh']);
  });

  it.each(['PENDIENTE_VERIFICACION', 'PENDIENTE_APROBACION', 'BLOQUEADA', 'DESACTIVADA'])(
    'una sesión con estado %s no entra, ve el aviso y no hay bucle de redirección',
    async (estado) => {
      const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': () => json(200, { ...USER, estado }) });

      renderAt(ROUTES.inicio);

      expect(await screen.findByRole('alert')).toHaveTextContent(/no está habilitada/);
      expect(route()).toBe(ROUTES.iniciarSesion);
      expect(screen.queryByText(`Hola, ${USER.nombre}.`)).not.toBeInTheDocument();
      await act(flush);
      expect(api.count('GET /me')).toBe(1);
      expect(api.count('POST /refresh')).toBe(1);
    },
  );

  it('403 de /me: sin acceso, con mensaje, sin reintentos ni logout', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': () => problem(403, 'acceso-denegado') });

    renderAt(ROUTES.inicio);

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está habilitada/);
    await act(flush);
    expect(route()).toBe(ROUTES.iniciarSesion);
    expect(api.routes()).toEqual(['POST /refresh', 'GET /me']);
  });

  it('403 de /me justo después de iniciar sesión: el mismo tratamiento, sin bucle', async () => {
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => granted('jwt'), 'GET /me': () => problem(403, 'acceso-denegado') });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está habilitada/);
    await act(flush);
    expect(route()).toBe(ROUTES.iniciarSesion);
    expect(api.count('GET /me')).toBe(1);
  });

  it('401 de /me con renovación fallida: sesión perdida, con aviso y sin bucle', async () => {
    const api = installFakeAuthApi({
      'POST /refresh': [() => granted('jwt'), () => problem(401, 'no-autenticado')],
      'GET /me': () => problem(401, 'no-autenticado'),
    });

    renderAt(ROUTES.inicio);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Tu sesión terminó/);
    await act(flush);
    expect(route()).toBe(ROUTES.iniciarSesion);
    expect(api.routes()).toEqual(['POST /refresh', 'GET /me', 'POST /refresh']);
    expect(getReturnPath()).toBe(ROUTES.inicio);
  });

  it('401 de /me con renovación correcta: un solo reintento y entra', async () => {
    const api = installFakeAuthApi({
      'POST /refresh': [() => granted('jwt-1'), () => granted('jwt-2')],
      'GET /me': [() => problem(401, 'no-autenticado'), meOk],
    });

    renderAt(ROUTES.inicio);

    await screen.findByText(`Hola, ${USER.nombre}.`);
    expect(api.routes()).toEqual(['POST /refresh', 'GET /me', 'POST /refresh', 'GET /me']);
  });

  it('503 en la restauración: no redirige y ofrece reintentar', async () => {
    installFakeAuthApi({ 'POST /refresh': [() => problem(503, 'servicio-saturado', { retryAfter: '5' }), () => granted('jwt')], 'GET /me': meOk });

    renderAt(ROUTES.inicio);

    expect(await screen.findByRole('alert')).toHaveTextContent(/No se cerró tu sesión/);
    expect(route()).toBe(ROUTES.inicio);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(`Hola, ${USER.nombre}.`)).toBeInTheDocument();
  });

  it('login aceptado con /me caído: no afirma que falló, y reintentar entra sin otro login', async () => {
    const api = installFakeAuthApi({ ...anonymous, 'POST /login': () => granted('jwt'), 'GET /me': [() => problem(503, 'servicio-saturado'), meOk] });
    renderAt(ROUTES.iniciarSesion);

    fillLogin();
    submitLogin();

    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(route()).toBe(ROUTES.inicio);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await screen.findByText(`Hola, ${USER.nombre}.`);
    expect(api.count('POST /login')).toBe(1);
    expect(api.count('POST /refresh')).toBe(1);
  });

  it('en /iniciar-sesion con el servicio caído se puede intentar entrar', async () => {
    installFakeAuthApi({ 'POST /refresh': () => problem(503, 'servicio-saturado'), 'POST /login': () => granted('jwt'), 'GET /me': meOk });
    renderAt(ROUTES.iniciarSesion);
    await act(flush);

    fillLogin();
    submitLogin();

    await screen.findByText(`Hola, ${USER.nombre}.`);
  });

  it('una cuenta sin rol no muestra una etiqueta inventada', async () => {
    installFakeAuthApi({ 'POST /refresh': () => granted('jwt'), 'GET /me': () => json(200, { ...USER, rol: null }) });

    renderAt(ROUTES.inicio);

    await screen.findByText(`Hola, ${USER.nombre}.`);
    expect(screen.queryByText(/Tu rol/)).not.toBeInTheDocument();
  });
});

describe('Cierre de sesión (CA-07)', () => {
  const session = { 'POST /refresh': () => granted('jwt'), 'GET /me': meOk };
  const clickLogout = () => fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

  it('204: lleva a Iniciar sesión, lo informa y no recuerda la ruta', async () => {
    const api = installFakeAuthApi({ ...session, 'POST /logout': noContent });
    renderAt(ROUTES.inicio);
    await screen.findByText(`Hola, ${USER.nombre}.`);

    clickLogout();

    expect(await screen.findByRole('status')).toHaveTextContent('Tu sesión se cerró.');
    expect(route()).toBe(ROUTES.iniciarSesion);
    expect(getReturnPath()).toBeNull();
    expect(api.calls.at(-1)?.headers.authorization).toBe('Bearer jwt');
  });

  it('con JWT vencido renueva y cierra', async () => {
    const api = installFakeAuthApi({ ...session, 'POST /logout': [() => problem(401, 'no-autenticado'), noContent] });
    renderAt(ROUTES.inicio);
    await screen.findByText(`Hola, ${USER.nombre}.`);

    clickLogout();

    await screen.findByRole('status');
    expect(api.routes()).toEqual(['POST /refresh', 'GET /me', 'POST /logout', 'POST /refresh', 'POST /logout']);
  });

  it('sin red no afirma que se cerró, y se puede reintentar', async () => {
    let attempt = 0;
    installFakeAuthApi({
      ...session,
      'POST /logout': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return noContent();
      },
    });
    renderAt(ROUTES.inicio);
    await screen.findByText(`Hola, ${USER.nombre}.`);

    clickLogout();

    expect(await screen.findByRole('alert')).toHaveTextContent(/tu sesión sigue abierta/);
    expect(route()).toBe(ROUTES.inicio);
    clickLogout();
    expect(await screen.findByRole('status')).toHaveTextContent('Tu sesión se cerró.');
  });

  it('no hay doble cierre', async () => {
    const pending = deferred<Response>();
    const api = installFakeAuthApi({ ...session, 'POST /logout': () => pending.promise });
    renderAt(ROUTES.inicio);
    await screen.findByText(`Hola, ${USER.nombre}.`);

    clickLogout();
    await act(flush);
    const button = screen.getByRole('button', { name: 'Cerrando sesión…' });
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await act(flush);

    expect(api.count('POST /logout')).toBe(1);
    pending.resolve(noContent());
    await screen.findByRole('status');
  });

  it('403 al cerrar: limpia el estado local y lo explica (riesgo de backend documentado)', async () => {
    const api = installFakeAuthApi({ ...session, 'POST /logout': () => problem(403, 'acceso-denegado') });
    renderAt(ROUTES.inicio);
    await screen.findByText(`Hola, ${USER.nombre}.`);

    clickLogout();

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está habilitada/);
    expect(route()).toBe(ROUTES.iniciarSesion);
    expect(api.count('POST /logout')).toBe(1);
  });

  it('el cierre en otra pestaña saca de la ruta privada, sin solicitudes', async () => {
    const api = installFakeAuthApi(session);
    const other = new BroadcastChannel('omr-auth');
    renderAt(ROUTES.inicio);
    await screen.findByText(`Hola, ${USER.nombre}.`);
    const before = api.calls.length;

    other.postMessage({ tipo: 'logout' });

    await waitFor(() => expect(route()).toBe(ROUTES.iniciarSesion));
    expect(api.calls.length).toBe(before);
    other.close();
  });
});
