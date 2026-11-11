import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '../../../app/routes.ts';
import { deferred, flush, installFakeAuthApi, json, problem } from '../../../test/fake-auth-api.ts';
import { captureLinkToken, discardLinkToken } from '../link-token/capture.ts';
import {
  forgetPendingVerification,
  getPendingVerification,
  rememberPendingVerification,
} from '../registration/pending-verification.ts';
import { CheckEmailPage } from './CheckEmailPage.tsx';
import { RegisterPage } from './RegisterPage.tsx';
import { ResendVerificationPage } from './ResendVerificationPage.tsx';
import { VerifyEmailPage } from './VerifyEmailPage.tsx';

const REGISTER_MESSAGE = 'Si el correo puede registrarse, te enviamos un enlace de verificación.';
const RESEND_MESSAGE = 'Si el correo tiene una verificación pendiente, te enviamos un nuevo enlace.';
const VALID_PASSWORD = 'una-clave-bastante-larga';

function Where() {
  return <span data-testid="ruta">{useLocation().pathname}</span>;
}

function renderAt(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={ROUTES.registro} element={<RegisterPage />} />
          <Route path={ROUTES.revisaTuCorreo} element={<CheckEmailPage />} />
          <Route path={ROUTES.reenviarVerificacion} element={<ResendVerificationPage />} />
          <Route path={ROUTES.verificarCorreo} element={<VerifyEmailPage />} />
          <Route path="*" element={<p>Otra pantalla</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </StrictMode>,
  );
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillRegister(correo = 'persona@example.test', password = VALID_PASSWORD) {
  type('Nombre', 'Persona de prueba');
  type('Correo', correo);
  type('Contraseña', password);
}

const submit = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

/** Reproduce lo que hace `main.tsx` al abrir el enlace del correo. */
function openVerificationLink(token = 'token-del-enlace') {
  window.history.pushState({}, '', `${ROUTES.verificarCorreo}#token=${token}`);
  captureLinkToken();
  renderAt(ROUTES.verificarCorreo);
}

afterEach(() => {
  forgetPendingVerification();
  discardLinkToken();
  window.history.pushState({}, '', '/');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Registro (CA-02, CA-03, RN-04)', () => {
  it('solo pide nombre, correo y contraseña: sin rol ni institución', () => {
    installFakeAuthApi({});

    renderAt(ROUTES.registro);

    const form = screen.getByRole('button', { name: 'Crear cuenta' }).closest('form');
    expect(Array.from(form?.querySelectorAll('input, select, textarea') ?? []).map((el) => el.getAttribute('name'))).toEqual([
      'nombre',
      'correo',
      'password',
    ]);
    expect(screen.queryByText(/rol|instituci/i)).not.toBeInTheDocument();
  });

  it('envía exactamente esos tres datos y lleva a Revisa tu correo con el mensaje del backend', async () => {
    const api = installFakeAuthApi({ 'POST /register': () => json(202, { mensaje: REGISTER_MESSAGE }) });
    renderAt(ROUTES.registro);

    fillRegister();
    submit('Crear cuenta');

    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(ROUTES.revisaTuCorreo));
    expect(await screen.findByText(REGISTER_MESSAGE)).toBeInTheDocument();
    expect(JSON.parse(api.calls[0]?.rawBody ?? '')).toEqual({
      nombre: 'Persona de prueba',
      correo: 'persona@example.test',
      password: VALID_PASSWORD,
    });
  });

  it('la contraseña no se conserva tras el registro', async () => {
    installFakeAuthApi({ 'POST /register': () => json(202, { mensaje: REGISTER_MESSAGE }) });
    renderAt(ROUTES.registro);

    fillRegister();
    submit('Crear cuenta');
    await screen.findByText(REGISTER_MESSAGE);

    expect(JSON.stringify(getPendingVerification())).not.toContain(VALID_PASSWORD);
    expect(document.body.textContent).not.toContain(VALID_PASSWORD);
  });

  it('con el formulario vacío no envía, marca cada campo y lleva el foco al primero', async () => {
    const api = installFakeAuthApi({});
    renderAt(ROUTES.registro);

    submit('Crear cuenta');

    expect(await screen.findByText('Escribe tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument();
    expect(screen.getByText('Escribe una contraseña de entre 12 y 128 caracteres.')).toBeInTheDocument();
    expect(api.calls).toEqual([]);
    expect(screen.getByLabelText('Nombre')).toHaveFocus();
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['11 caracteres', 'a'.repeat(11), false],
    ['12 caracteres', 'a'.repeat(12), true],
    ['128 caracteres', 'a'.repeat(128), true],
    ['129 caracteres', 'a'.repeat(129), false],
  ])('contraseña de %s: envío %s', async (_name, password, sends) => {
    const api = installFakeAuthApi({ 'POST /register': () => json(202, { mensaje: REGISTER_MESSAGE }) });
    renderAt(ROUTES.registro);

    fillRegister('persona@example.test', password);
    submit('Crear cuenta');
    await act(flush);

    expect(api.count('POST /register')).toBe(sends ? 1 : 0);
  });

  it('publica la política antes del primer error, y la asocia al campo (RNF-02)', () => {
    installFakeAuthApi({});

    renderAt(ROUTES.registro);

    const input = screen.getByLabelText('Contraseña');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')).toHaveTextContent(/Entre 12 y 128 caracteres/);
    expect(input).toHaveAttribute('autocomplete', 'new-password');
  });

  it('el campo de contraseña no bloquea el pegado (RNF-02)', () => {
    installFakeAuthApi({});
    renderAt(ROUTES.registro);

    const notPrevented = fireEvent.paste(screen.getByLabelText('Contraseña'));

    expect(notPrevented).toBe(true);
    expect(screen.getByLabelText('Contraseña')).not.toHaveAttribute('maxlength');
  });

  it('un 422 del backend se muestra junto a la contraseña, conservando lo escrito', async () => {
    installFakeAuthApi({
      'POST /register': () => problem(422, 'politica-password', { errores: [{ campo: 'password', reglas: ['DEMASIADO_CORTA'] }] }),
    });
    renderAt(ROUTES.registro);

    fillRegister();
    submit('Crear cuenta');

    expect(await screen.findByText('La contraseña debe tener entre 12 y 128 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toHaveValue(VALID_PASSWORD);
    expect(screen.getByLabelText('Contraseña')).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('DEMASIADO_CORTA');
  });

  it('un 400 con errores[] marca el campo y no muestra las reglas internas', async () => {
    installFakeAuthApi({ 'POST /register': () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'correo', reglas: ['matches'] }] }) });
    renderAt(ROUTES.registro);

    fillRegister();
    submit('Crear cuenta');

    expect(await screen.findByText(/Revisa el correo/)).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true');
    expect(document.body.textContent).not.toContain('matches');
  });

  it('un 400 sobre un campo ajeno al formulario se muestra como error general', async () => {
    installFakeAuthApi({ 'POST /register': () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'otro', reglas: ['x'] }] }) });
    renderAt(ROUTES.registro);

    fillRegister();
    submit('Crear cuenta');

    expect(await screen.findByRole('alert')).toHaveTextContent(/Algo salió mal/);
  });

  it.each([
    ['503', () => problem(503, 'servicio-saturado', { retryAfter: '5' }), /no está disponible/],
    ['500', () => problem(500, 'error-interno'), /Algo salió mal/],
    ['403 de origen', () => problem(403, 'origen-no-permitido'), /error de configuración/],
    ['tipo desconocido', () => problem(418, 'tipo-futuro'), /Algo salió mal/],
  ])('%s: mensaje claro, foco en el resultado y lo escrito se conserva', async (_name, response, text) => {
    installFakeAuthApi({ 'POST /register': response });
    renderAt(ROUTES.registro);

    fillRegister();
    submit('Crear cuenta');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('Correo')).toHaveValue('persona@example.test');
    expect(screen.getByLabelText('Contraseña')).toHaveValue(VALID_PASSWORD);
    expect(screen.getByTestId('ruta')).toHaveTextContent(ROUTES.registro);
  });

  it('un fallo de red permite reintentar con lo escrito', async () => {
    let attempt = 0;
    const api = installFakeAuthApi({
      'POST /register': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        return json(202, { mensaje: REGISTER_MESSAGE });
      },
    });
    renderAt(ROUTES.registro);
    fillRegister();
    submit('Crear cuenta');
    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos conectarnos/);

    submit('Crear cuenta');

    expect(await screen.findByText(REGISTER_MESSAGE)).toBeInTheDocument();
    expect(api.count('POST /register')).toBe(2);
  });

  it('no hay doble envío: el botón cambia de texto y queda inactivo', async () => {
    const pending = deferred<Response>();
    const api = installFakeAuthApi({ 'POST /register': () => pending.promise });
    renderAt(ROUTES.registro);
    fillRegister();
    const button = screen.getByRole('button', { name: 'Crear cuenta' });

    fireEvent.click(button);
    await act(flush);
    expect(button).toHaveTextContent('Creando tu cuenta…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await act(flush);

    expect(api.count('POST /register')).toBe(1);
    pending.resolve(json(202, { mensaje: REGISTER_MESSAGE }));
    await screen.findByText(REGISTER_MESSAGE);
  });

  it('un 429 informa la espera y bloquea el botón hasta que termina', async () => {
    const api = installFakeAuthApi({ 'POST /register': () => problem(429, 'demasiados-intentos', { retryAfter: '1' }) });
    renderAt(ROUTES.registro);
    fillRegister();

    submit('Crear cuenta');

    expect(await screen.findByRole('alert')).toHaveTextContent('Podrás intentarlo de nuevo en 1 segundo.');
    const button = screen.getByRole('button', { name: 'Espera para reintentar' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await act(flush);
    expect(api.count('POST /register')).toBe(1);

    expect(await screen.findByRole('button', { name: 'Crear cuenta' }, { timeout: 2000 })).not.toHaveAttribute('aria-disabled');
  });

  it('un 429 sin Retry-After dice «intenta más tarde», sin inventar un tiempo', async () => {
    installFakeAuthApi({ 'POST /register': () => problem(429, 'demasiados-intentos') });
    renderAt(ROUTES.registro);
    fillRegister();

    submit('Crear cuenta');

    expect(await screen.findByRole('alert')).toHaveTextContent('Intenta más tarde.');
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).not.toHaveAttribute('aria-disabled');
  });

  it('expresa las esperas largas en minutos', async () => {
    installFakeAuthApi({ 'POST /register': () => problem(429, 'demasiados-intentos', { retryAfter: '3540' }) });
    renderAt(ROUTES.registro);
    fillRegister();

    submit('Crear cuenta');

    expect(await screen.findByRole('alert')).toHaveTextContent('59 minutos');
  });
});

describe('Revisa tu correo (CA-03, CA-04)', () => {
  it('muestra el mensaje del backend y lleva el foco a él', async () => {
    rememberPendingVerification({ correo: 'persona@example.test', mensaje: REGISTER_MESSAGE });
    installFakeAuthApi({});

    renderAt(ROUTES.revisaTuCorreo);

    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(REGISTER_MESSAGE);
  });

  it('pedir otro enlace usa el correo en memoria y muestra el nuevo mensaje', async () => {
    rememberPendingVerification({ correo: 'persona@example.test', mensaje: REGISTER_MESSAGE });
    const api = installFakeAuthApi({ 'POST /resend-verification': () => json(202, { mensaje: RESEND_MESSAGE }) });
    renderAt(ROUTES.revisaTuCorreo);

    submit('Pedir otro enlace');

    expect(await screen.findByText(RESEND_MESSAGE)).toBeInTheDocument();
    expect(JSON.parse(api.calls[0]?.rawBody ?? '')).toEqual({ correo: 'persona@example.test' });
  });

  it('el reenvío limitado informa y bloquea', async () => {
    rememberPendingVerification({ correo: 'persona@example.test', mensaje: REGISTER_MESSAGE });
    installFakeAuthApi({ 'POST /resend-verification': () => problem(429, 'demasiados-intentos', { retryAfter: '600' }) });
    renderAt(ROUTES.revisaTuCorreo);

    submit('Pedir otro enlace');

    expect(await screen.findByRole('alert')).toHaveTextContent('10 minutos');
    expect(screen.getByRole('button', { name: 'Espera para reintentar' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('tras recargar, sin datos en memoria, ofrece Reenviar verificación', () => {
    installFakeAuthApi({});

    renderAt(ROUTES.revisaTuCorreo);

    expect(screen.getByRole('link', { name: 'Reenviar verificación' })).toHaveAttribute('href', ROUTES.reenviarVerificacion);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('siempre ofrece volver a Iniciar sesión', () => {
    installFakeAuthApi({});

    renderAt(ROUTES.revisaTuCorreo);

    expect(screen.getByRole('link', { name: 'Volver a Iniciar sesión' })).toHaveAttribute('href', ROUTES.iniciarSesion);
  });
});

describe('Reenviar verificación (CA-04, RN-05)', () => {
  it('valida el correo antes de enviar', async () => {
    const api = installFakeAuthApi({});
    renderAt(ROUTES.reenviarVerificacion);

    type('Correo', 'no-es-un-correo');
    submit('Enviar enlace');

    expect(await screen.findByText(/Revisa el correo/)).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toHaveFocus();
    expect(api.calls).toEqual([]);
  });

  it('muestra el mensaje del backend tal como llega', async () => {
    const api = installFakeAuthApi({ 'POST /resend-verification': () => json(202, { mensaje: RESEND_MESSAGE }) });
    renderAt(ROUTES.reenviarVerificacion);

    type('Correo', 'persona@example.test');
    submit('Enviar enlace');

    expect(await screen.findByRole('status')).toHaveTextContent(RESEND_MESSAGE);
    expect(JSON.parse(api.calls[0]?.rawBody ?? '')).toEqual({ correo: 'persona@example.test' });
  });

  it('un error de red conserva el correo', async () => {
    installFakeAuthApi({});
    renderAt(ROUTES.reenviarVerificacion);

    type('Correo', 'persona@example.test');
    submit('Enviar enlace');

    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos conectarnos/);
    expect(screen.getByLabelText('Correo')).toHaveValue('persona@example.test');
  });

  it('propone el correo que se acaba de registrar', () => {
    rememberPendingVerification({ correo: 'persona@example.test', mensaje: REGISTER_MESSAGE });
    installFakeAuthApi({});

    renderAt(ROUTES.reenviarVerificacion);

    expect(screen.getByLabelText('Correo')).toHaveValue('persona@example.test');
  });
});

describe('Verificar correo (CA-04, CA-05, RN-06, RN-09)', () => {
  it('abrir el enlace no envía nada, ni siquiera en StrictMode', async () => {
    const api = installFakeAuthApi({});

    openVerificationLink();
    await act(flush);

    expect(api.calls).toEqual([]);
    expect(screen.getByRole('button', { name: 'Confirmar mi correo' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });

  it('el token se envía solo en el cuerpo del POST, y no aparece en pantalla', async () => {
    const api = installFakeAuthApi({ 'POST /verify-email': () => json(200, { estado: 'PENDIENTE_APROBACION' }) });

    openVerificationLink('token-secreto');
    expect(document.body.textContent).not.toContain('token-secreto');
    submit('Confirmar mi correo');
    await screen.findByText('Tu correo quedó verificado.');

    expect(api.calls[0]?.url).toBe('/api/v1/auth/verify-email');
    expect(api.calls[0]?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(api.calls[0]?.rawBody ?? '')).toEqual({ token: 'token-secreto' });
  });

  it('PENDIENTE_APROBACION: explica que falta la aprobación y no ofrece entrar', async () => {
    installFakeAuthApi({ 'POST /verify-email': () => json(200, { estado: 'PENDIENTE_APROBACION' }) });

    openVerificationLink();
    submit('Confirmar mi correo');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Tu correo quedó verificado.');
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.getByText(/un administrador debe aprobar tu cuenta/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir a Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar mi correo' })).not.toBeInTheDocument();
  });

  it('otro estado: no habla de aprobación e invita a iniciar sesión', async () => {
    installFakeAuthApi({ 'POST /verify-email': () => json(200, { estado: 'ACTIVA' }) });

    openVerificationLink();
    submit('Confirmar mi correo');

    await screen.findByText('Tu correo quedó verificado.');
    expect(screen.getByRole('link', { name: 'Ir a Iniciar sesión' })).toHaveAttribute('href', ROUTES.iniciarSesion);
    expect(screen.queryByText(/aprobar/)).not.toBeInTheDocument();
  });

  it('enlace no válido: mensaje claro y Reenviar verificación', async () => {
    installFakeAuthApi({ 'POST /verify-email': () => problem(400, 'enlace-invalido', { title: 'Título del backend' }) });

    openVerificationLink();
    submit('Confirmar mi correo');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/ya no sirve/);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Reenviar verificación' })).toHaveAttribute('href', ROUTES.reenviarVerificacion);
    expect(screen.queryByRole('button', { name: 'Confirmar mi correo' })).not.toBeInTheDocument();
  });

  it('un token mal formado se trata como enlace no válido', async () => {
    installFakeAuthApi({ 'POST /verify-email': () => problem(400, 'solicitud-invalida', { errores: [{ campo: 'token', reglas: ['maxLength'] }] }) });

    openVerificationLink();
    submit('Confirmar mi correo');

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya no sirve/);
  });

  it.each([
    ['503', () => problem(503, 'servicio-saturado', { retryAfter: '5' }), /no está disponible/],
    ['500', () => problem(500, 'error-interno'), /Algo salió mal/],
  ])('%s: conserva el enlace y permite reintentar', async (_name, response, text) => {
    const api = installFakeAuthApi({
      'POST /verify-email': [response, () => json(200, { estado: 'PENDIENTE_APROBACION' })],
    });

    openVerificationLink('token-reintento');
    submit('Confirmar mi correo');
    expect(await screen.findByRole('alert')).toHaveTextContent(text);

    submit('Confirmar mi correo');

    await screen.findByText('Tu correo quedó verificado.');
    expect(JSON.parse(api.calls[1]?.rawBody ?? '')).toEqual({ token: 'token-reintento' });
  });

  it('un fallo de red conserva el enlace', async () => {
    installFakeAuthApi({});

    openVerificationLink();
    submit('Confirmar mi correo');

    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos conectarnos/);
    expect(screen.getByRole('button', { name: 'Confirmar mi correo' })).toBeInTheDocument();
  });

  it('no hay doble confirmación', async () => {
    const pending = deferred<Response>();
    const api = installFakeAuthApi({ 'POST /verify-email': () => pending.promise });

    openVerificationLink();
    const button = screen.getByRole('button', { name: 'Confirmar mi correo' });
    fireEvent.click(button);
    await act(flush);
    fireEvent.submit(button.closest('form') as HTMLFormElement);
    await act(flush);

    expect(api.count('POST /verify-email')).toBe(1);
    pending.resolve(json(200, { estado: 'PENDIENTE_APROBACION' }));
    await screen.findByText('Tu correo quedó verificado.');
  });

  it('tras recargar sin token: pide abrir el enlace de nuevo, y no permite confirmar', () => {
    const api = installFakeAuthApi({});

    renderAt(ROUTES.verificarCorreo);

    expect(screen.getByRole('status')).toHaveTextContent(/Ábrelo de nuevo desde tu correo/);
    expect(screen.getByRole('link', { name: 'Reenviar verificación' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(api.calls).toEqual([]);
  });

  it('el token de otro flujo no sirve aquí (plan §2.5)', () => {
    window.history.pushState({}, '', `${ROUTES.restablecerContrasena}#token=de-otro-flujo`);
    captureLinkToken();
    installFakeAuthApi({});

    renderAt(ROUTES.verificarCorreo);

    expect(screen.queryByRole('button', { name: 'Confirmar mi correo' })).not.toBeInTheDocument();
  });
});
