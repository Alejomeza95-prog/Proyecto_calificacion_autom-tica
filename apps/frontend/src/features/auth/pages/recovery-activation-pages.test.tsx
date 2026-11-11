import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '../../../app/routes.ts';
import { deferred, flush, installFakeAuthApi, json, noContent, problem } from '../../../test/fake-auth-api.ts';
import { captureLinkToken, discardLinkToken, getLinkToken } from '../link-token/capture.ts';
import { ActivateAccountPage } from './ActivateAccountPage.tsx';
import { ForgotPasswordPage } from './ForgotPasswordPage.tsx';
import { ResetPasswordPage } from './ResetPasswordPage.tsx';

const FORGOT_MESSAGE = 'Si la cuenta puede recuperar su contraseña, te enviamos un enlace.';
const VALID_PASSWORD = 'una-clave-bastante-larga';

function renderAt(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={ROUTES.olvideContrasena} element={<ForgotPasswordPage />} />
          <Route path={ROUTES.restablecerContrasena} element={<ResetPasswordPage />} />
          <Route path={ROUTES.activarCuenta} element={<ActivateAccountPage />} />
          <Route path="*" element={<p>Otra pantalla</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}

const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function openLink(route: string, token = 'token-del-enlace') {
  window.history.pushState({}, '', `${route}#token=${token}`);
  captureLinkToken();
  renderAt(route);
}

afterEach(() => {
  discardLinkToken();
  window.history.pushState({}, '', '/');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Olvidé mi contraseña (CA-06, CA-10, RN-05)', () => {
  it('envía solo el correo y muestra el mensaje del backend, con foco', async () => {
    const api = installFakeAuthApi({ 'POST /password/forgot': () => json(202, { mensaje: FORGOT_MESSAGE }) });
    renderAt(ROUTES.olvideContrasena);
    type('Correo', 'persona@example.test');

    submit('Enviar enlace');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(FORGOT_MESSAGE);
    await waitFor(() => expect(status).toHaveFocus());
    expect(JSON.parse(api.calls[0]?.rawBody ?? '')).toEqual({ correo: 'persona@example.test' });
    expect(screen.getByRole('link', { name: 'Reenviar verificación' })).toHaveAttribute('href', ROUTES.reenviarVerificacion);
  });

  it.each([
    ['', 'Escribe tu correo.'],
    ['sin-arroba', 'Revisa el correo. Debe tener la forma nombre@dominio.com.'],
  ])('«%s» no se envía, y el foco va al campo', async (correo, message) => {
    const api = installFakeAuthApi({});
    renderAt(ROUTES.olvideContrasena);
    type('Correo', correo);

    submit('Enviar enlace');

    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Correo')).toHaveFocus());
    expect(api.calls).toEqual([]);
  });

  it('un 400 de validación se muestra junto al campo, con texto propio', async () => {
    installFakeAuthApi({
      'POST /password/forgot': () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'correo', reglas: ['matches'] }] }),
    });
    renderAt(ROUTES.olvideContrasena);
    type('Correo', 'persona@example.test');

    submit('Enviar enlace');

    expect(await screen.findByText('Revisa el correo. Debe tener la forma nombre@dominio.com.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un doble envío hace una sola solicitud, y muestra el estado de carga', async () => {
    const gate = deferred<Response>();
    const api = installFakeAuthApi({ 'POST /password/forgot': () => gate.promise });
    renderAt(ROUTES.olvideContrasena);
    type('Correo', 'persona@example.test');

    submit('Enviar enlace');
    expect(await screen.findByRole('button', { name: 'Enviando…' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.submit(screen.getByRole('button', { name: 'Enviando…' }).closest('form') as HTMLFormElement);

    await act(async () => {
      gate.resolve(json(202, { mensaje: FORGOT_MESSAGE }));
      await flush();
    });
    expect(api.calls).toHaveLength(1);
  });

  it('un 429 informa la espera, bloquea mientras dura y conserva el correo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = installFakeAuthApi({
      'POST /password/forgot': () => problem(429, 'demasiados-intentos', { retryAfter: '30' }),
    });
    renderAt(ROUTES.olvideContrasena);
    type('Correo', 'persona@example.test');

    submit('Enviar enlace');

    expect(await screen.findByRole('alert')).toHaveTextContent('Podrás intentarlo de nuevo en 30 segundos.');
    expect(screen.getByLabelText('Correo')).toHaveValue('persona@example.test');
    const blocked = screen.getByRole('button', { name: 'Espera para reintentar' });
    fireEvent.submit(blocked.closest('form') as HTMLFormElement);
    await act(flush);
    expect(api.calls).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeInTheDocument();
  });

  it.each([
    ['503', () => problem(503, 'servicio-saturado', { retryAfter: '5' }), /no está disponible/],
    ['500', () => problem(500, 'error-interno'), /Algo salió mal/],
  ])('un %s conserva el correo', async (_name, response, message) => {
    installFakeAuthApi({ 'POST /password/forgot': response });
    renderAt(ROUTES.olvideContrasena);
    type('Correo', 'persona@example.test');

    submit('Enviar enlace');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Correo')).toHaveValue('persona@example.test');
  });
});

const FLOWS = [
  {
    name: 'Crear nueva contraseña',
    route: ROUTES.restablecerContrasena,
    endpoint: 'POST /password/reset',
    url: '/api/v1/auth/password/reset',
    label: 'Nueva contraseña',
    action: 'Guardar contraseña',
    pending: 'Guardando…',
    done: 'Tu contraseña se cambió.',
    invalid: 'Este enlace ya no sirve',
  },
  {
    name: 'Activar cuenta',
    route: ROUTES.activarCuenta,
    endpoint: 'POST /activate',
    url: '/api/v1/auth/activate',
    label: 'Contraseña',
    action: 'Activar mi cuenta',
    pending: 'Activando…',
    done: 'Tu cuenta quedó activada.',
    invalid: 'Este enlace de activación ya no sirve',
  },
] as const;

describe.each(FLOWS)('$name (CA-06, CA-10, CA-14, RN-06)', (flow) => {
  it('abrir el enlace no envía nada, ni siquiera en StrictMode, y limpia la URL', async () => {
    const api = installFakeAuthApi({});

    openLink(flow.route, 'token-secreto');
    await act(flush);

    expect(api.calls).toEqual([]);
    expect(window.location.hash).toBe('');
    expect(document.body.textContent).not.toContain('token-secreto');
    expect(screen.getByRole('button', { name: flow.action })).toBeInTheDocument();
  });

  it('envía el token y la contraseña en el cuerpo, solo a su endpoint, y confirma con foco', async () => {
    const api = installFakeAuthApi({ [flow.endpoint]: () => noContent() });
    openLink(flow.route, 'token-secreto');
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(flow.done);
    await waitFor(() => expect(status).toHaveFocus());
    expect(api.calls.map((call) => call.url)).toEqual([flow.url]);
    expect(JSON.parse(api.calls[0]?.rawBody ?? '')).toEqual({ token: 'token-secreto', password: VALID_PASSWORD });
    expect(screen.getByRole('link', { name: 'Ir a Iniciar sesión' })).toHaveAttribute('href', ROUTES.iniciarSesion);
    expect(getLinkToken(flow.route)).toBeNull();
    expect(screen.queryByLabelText(flow.label)).not.toBeInTheDocument();
  });

  it.each([
    ['', 'Escribe una contraseña de entre 12 y 128 caracteres.'],
    ['corta', 'La contraseña debe tener entre 12 y 128 caracteres; ahora tiene 5.'],
    ['x'.repeat(129), 'La contraseña debe tener entre 12 y 128 caracteres; ahora tiene 129.'],
  ])('«%s» no se envía, y el foco va al campo', async (password, message) => {
    const api = installFakeAuthApi({});
    openLink(flow.route);
    type(flow.label, password);

    submit(flow.action);

    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(flow.label)).toHaveFocus());
    expect(api.calls).toEqual([]);
  });

  it('una frase con espacios se envía sin recortar', async () => {
    const api = installFakeAuthApi({ [flow.endpoint]: () => noContent() });
    openLink(flow.route);
    type(flow.label, '  una frase con espacios  ');

    submit(flow.action);

    await screen.findByRole('status');
    expect((JSON.parse(api.calls[0]?.rawBody ?? '') as { password: string }).password).toBe('  una frase con espacios  ');
  });

  it('un 422 muestra la política junto al campo, y conserva la contraseña y el enlace', async () => {
    let attempts = 0;
    const api = installFakeAuthApi({
      [flow.endpoint]: () => {
        attempts += 1;
        return attempts === 1 ? problem(422, 'politica-password', { errores: [{ campo: 'password', reglas: ['longitud'] }] }) : noContent();
      },
    });
    openLink(flow.route);
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);

    expect(await screen.findByText('La contraseña debe tener entre 12 y 128 caracteres.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(flow.label)).toHaveFocus());
    expect(screen.getByLabelText(flow.label)).toHaveValue(VALID_PASSWORD);
    expect(getLinkToken(flow.route)).toBe('token-del-enlace');

    submit(flow.action);
    expect(await screen.findByRole('status')).toHaveTextContent(flow.done);
    expect(api.calls).toHaveLength(2);
  });

  it('un enlace no válido limpia la contraseña, olvida el token y mueve el foco', async () => {
    installFakeAuthApi({ [flow.endpoint]: () => problem(400, 'enlace-invalido', { title: 'Título del backend' }) });
    openLink(flow.route);
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(flow.invalid);
    expect(alert).not.toHaveTextContent('Título del backend');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(getLinkToken(flow.route)).toBeNull();
    expect(screen.queryByLabelText(flow.label)).not.toBeInTheDocument();
  });

  it('un token mal formado se trata como enlace no válido', async () => {
    installFakeAuthApi({
      [flow.endpoint]: () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'token', reglas: ['maxLength'] }] }),
    });
    openLink(flow.route);
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);

    expect(await screen.findByRole('alert')).toHaveTextContent(flow.invalid);
  });

  it('un 400 de validación de la contraseña no gasta el enlace', async () => {
    installFakeAuthApi({
      [flow.endpoint]: () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'password', reglas: ['maxLength'] }] }),
    });
    openLink(flow.route);
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);

    expect(await screen.findByText('La contraseña debe tener entre 12 y 128 caracteres.')).toBeInTheDocument();
    expect(getLinkToken(flow.route)).toBe('token-del-enlace');
  });

  it('un doble envío hace una sola solicitud, y muestra el estado de carga', async () => {
    const gate = deferred<Response>();
    const api = installFakeAuthApi({ [flow.endpoint]: () => gate.promise });
    openLink(flow.route);
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);
    const pending = await screen.findByRole('button', { name: flow.pending });
    expect(pending).toHaveAttribute('aria-disabled', 'true');
    fireEvent.submit(pending.closest('form') as HTMLFormElement);

    await act(async () => {
      gate.resolve(noContent());
      await flush();
    });
    expect(api.calls).toHaveLength(1);
  });

  it('un 429 informa la espera, bloquea mientras dura y conserva la contraseña y el enlace', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = installFakeAuthApi({ [flow.endpoint]: () => problem(429, 'demasiados-intentos', { retryAfter: '60' }) });
    openLink(flow.route);
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Podrás intentarlo de nuevo en 1 minuto.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText(flow.label)).toHaveValue(VALID_PASSWORD);
    expect(getLinkToken(flow.route)).toBe('token-del-enlace');
    const blocked = screen.getByRole('button', { name: 'Espera para reintentar' });
    fireEvent.submit(blocked.closest('form') as HTMLFormElement);
    await act(flush);
    expect(api.calls).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByRole('button', { name: flow.action })).toBeInTheDocument();
  });

  it.each([
    ['503', () => problem(503, 'servicio-saturado', { retryAfter: '5' }), /no está disponible/],
    ['500', () => problem(500, 'error-interno'), /Algo salió mal/],
    ['403 de origen', () => problem(403, 'origen-no-permitido'), /error de configuración/],
  ])('un %s conserva la contraseña y el enlace', async (_name, response, message) => {
    installFakeAuthApi({ [flow.endpoint]: response });
    openLink(flow.route);
    type(flow.label, VALID_PASSWORD);

    submit(flow.action);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText(flow.label)).toHaveValue(VALID_PASSWORD);
    expect(getLinkToken(flow.route)).toBe('token-del-enlace');
  });

  it('sin token no ofrece el formulario ni envía nada', async () => {
    const api = installFakeAuthApi({});

    renderAt(flow.route);
    await act(flush);

    expect(screen.getByRole('status')).toHaveTextContent('No encontramos un enlace');
    expect(screen.queryByLabelText(flow.label)).not.toBeInTheDocument();
    expect(api.calls).toEqual([]);
  });

  it('el token de otro flujo no sirve en esta pantalla', () => {
    installFakeAuthApi({});
    const other = flow.route === ROUTES.activarCuenta ? ROUTES.restablecerContrasena : ROUTES.activarCuenta;
    window.history.pushState({}, '', `${other}#token=de-otro-flujo`);
    captureLinkToken();

    renderAt(flow.route);

    expect(screen.queryByLabelText(flow.label)).not.toBeInTheDocument();
  });
});

describe('Crear nueva contraseña: salidas propias (CA-06)', () => {
  it('un enlace no válido o la falta de enlace ofrecen pedir otro', async () => {
    installFakeAuthApi({ 'POST /password/reset': () => problem(400, 'enlace-invalido') });
    openLink(ROUTES.restablecerContrasena);
    type('Nueva contraseña', VALID_PASSWORD);

    submit('Guardar contraseña');
    await screen.findByRole('alert');

    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute('href', ROUTES.olvideContrasena);
  });
});

describe('Activar cuenta: flujo propio (CA-14, RN-15)', () => {
  const RECOVERY = /recuper|restablec|olvid/i;

  function expectNoRecovery() {
    expect(document.body.textContent).not.toMatch(RECOVERY);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: RECOVERY })).not.toBeInTheDocument();
  }

  it('el formulario no menciona la recuperación ni muestra sus trámites', () => {
    installFakeAuthApi({});
    openLink(ROUTES.activarCuenta);

    expectNoRecovery();
  });

  it('nunca llama a /password/reset', async () => {
    const api = installFakeAuthApi({ 'POST /activate': () => noContent() });
    openLink(ROUTES.activarCuenta);
    type('Contraseña', VALID_PASSWORD);

    submit('Activar mi cuenta');
    await screen.findByRole('status');

    expect(api.calls.some((call) => call.url.includes('/password/'))).toBe(false);
    expectNoRecovery();
  });

  it('un enlace no válido indica pedir otro a quien opera el sistema, sin enlaces a la recuperación', async () => {
    installFakeAuthApi({ 'POST /activate': () => problem(400, 'enlace-invalido') });
    openLink(ROUTES.activarCuenta);
    type('Contraseña', VALID_PASSWORD);

    submit('Activar mi cuenta');

    expect(await screen.findByRole('alert')).toHaveTextContent('Pide uno nuevo a quien opera el sistema.');
    expectNoRecovery();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('sin enlace tampoco remite a la recuperación', () => {
    installFakeAuthApi({});

    renderAt(ROUTES.activarCuenta);

    expect(screen.getByRole('status')).toHaveTextContent('pide uno nuevo a quien opera el sistema');
    expectNoRecovery();
  });
});
