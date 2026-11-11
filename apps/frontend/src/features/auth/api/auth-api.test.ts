import { afterEach, describe, expect, it, vi } from 'vitest';
import { granted, installFakeAuthApi, json, meOk, noContent, problem, USER } from '../../../test/fake-auth-api.ts';
import * as authApi from './auth-api.ts';
import type { AccessTokenSource } from './http-client.ts';
import { isApiError } from './problem.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function tokenSource(current: string | null, ...renewals: string[]) {
  const renew = vi.fn(async () => {
    const next = renewals.shift();
    if (next === undefined) throw new Error('Renovación no prevista');
    return next;
  });
  const source: AccessTokenSource = { current: () => current, renew };
  return { source, renew };
}

describe('Una función por endpoint (plan §8)', () => {
  const ok = { mensaje: 'Mensaje del backend' };

  it.each([
    ['POST /register', () => authApi.register({ nombre: 'N', correo: 'c@example.test', password: 'p' }), json(202, ok), { nombre: 'N', correo: 'c@example.test', password: 'p' }],
    ['POST /verify-email', () => authApi.verifyEmail('t'), json(200, { estado: 'PENDIENTE_APROBACION' }), { token: 't' }],
    ['POST /resend-verification', () => authApi.resendVerification('c@example.test'), json(202, ok), { correo: 'c@example.test' }],
    ['POST /login', () => authApi.login({ correo: 'c@example.test', password: 'p' }), granted('jwt'), { correo: 'c@example.test', password: 'p' }],
    ['POST /password/forgot', () => authApi.forgotPassword('c@example.test'), json(202, ok), { correo: 'c@example.test' }],
    ['POST /password/reset', () => authApi.resetPassword({ token: 't', password: 'p' }), noContent(), { token: 't', password: 'p' }],
    ['POST /activate', () => authApi.activateAccount({ token: 't', password: 'p' }), noContent(), { token: 't', password: 'p' }],
  ])('%s envía exactamente su cuerpo por el mismo origen', async (route, call, response, body) => {
    const api = installFakeAuthApi({ [route]: () => response });

    await call();

    const [sent] = api.calls;
    expect(sent?.route).toBe(route);
    expect(sent?.url.startsWith('/api/v1/auth/')).toBe(true);
    expect(sent?.credentials).toBe('same-origin');
    expect(sent?.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(sent?.rawBody ?? '')).toEqual(body);
  });

  it('login incluye captchaToken solo cuando existe', async () => {
    const api = installFakeAuthApi({ 'POST /login': [() => granted('a'), () => granted('b')] });

    await authApi.login({ correo: 'c', password: 'p', captchaToken: 'captcha' });
    await authApi.login({ correo: 'c', password: 'p' });

    expect(JSON.parse(api.calls[0]?.rawBody ?? '')).toEqual({ correo: 'c', password: 'p', captchaToken: 'captcha' });
    expect(JSON.parse(api.calls[1]?.rawBody ?? '')).toEqual({ correo: 'c', password: 'p' });
  });

  it('refresh no lleva cuerpo ni cabeceras propias: lo autentica la cookie', async () => {
    const api = installFakeAuthApi({ 'POST /refresh': () => granted('jwt') });

    await expect(authApi.refresh()).resolves.toEqual({ accessToken: 'jwt', expiresIn: 900 });

    expect(api.calls[0]).toMatchObject({ rawBody: undefined, headers: {}, credentials: 'same-origin' });
  });

  it('el registro no deja pasar rol ni institución aunque se le entreguen (RN-04)', async () => {
    const api = installFakeAuthApi({ 'POST /register': () => json(202, ok) });
    const withExtras = { nombre: 'N', correo: 'c', password: 'p', rol: 'ADMIN', institucionId: 'x' };

    await authApi.register(withExtras);

    expect(Object.keys(JSON.parse(api.calls[0]?.rawBody ?? '') as object).sort()).toEqual(['correo', 'nombre', 'password']);
  });

  it('una respuesta satisfactoria fuera del contrato es un error tipado', async () => {
    installFakeAuthApi({
      'POST /refresh': () => json(200, { token: 'sin el campo esperado' }),
      'POST /register': () => new Response('<html></html>', { status: 200 }),
    });

    await expect(authApi.refresh()).rejects.toMatchObject({ kind: 'desconocido' });
    await expect(authApi.register({ nombre: 'N', correo: 'c', password: 'p' })).rejects.toMatchObject({ kind: 'desconocido' });
  });

  it('un rol o estado fuera del contrato en /me es un error tipado', async () => {
    installFakeAuthApi({ 'GET /me': () => json(200, { ...USER, rol: 'SUPERADMIN' }) });

    await expect(authApi.getMe(tokenSource('jwt').source)).rejects.toMatchObject({ kind: 'desconocido' });
  });

  it('un fallo de red es un error tipado, sin detalles del original', async () => {
    installFakeAuthApi({});

    const error: unknown = await authApi.forgotPassword('c@example.test').catch((caught: unknown) => caught);

    expect(isApiError(error, 'red')).toBe(true);
    expect(String(error)).not.toContain('c@example.test');
  });

  it('los errores no conservan lo enviado (RN-11)', async () => {
    installFakeAuthApi({ 'POST /login': () => problem(401, 'credenciales-invalidas') });

    const error: unknown = await authApi.login({ correo: 'c@example.test', password: 'secreto-123' }).catch((caught: unknown) => caught);

    const exposed = `${String(error)} ${JSON.stringify(error)}`;
    expect(exposed).not.toContain('secreto-123');
    expect(exposed).not.toContain('c@example.test');
  });
});

describe('Rutas protegidas (plan §2.4)', () => {
  it('/me y /logout llevan Bearer, y las públicas no', async () => {
    const api = installFakeAuthApi({
      'GET /me': meOk,
      'POST /logout': noContent,
      'POST /password/forgot': () => json(202, { mensaje: 'm' }),
    });
    const { source } = tokenSource('jwt-actual');

    await authApi.getMe(source);
    await authApi.logout(source);
    await authApi.forgotPassword('c');

    expect(api.calls[0]?.headers).toEqual({ authorization: 'Bearer jwt-actual' });
    expect(api.calls[1]?.headers).toEqual({ authorization: 'Bearer jwt-actual' });
    expect(api.calls[2]?.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('sin token en memoria renueva antes de llamar', async () => {
    const api = installFakeAuthApi({ 'GET /me': meOk });
    const { source, renew } = tokenSource(null, 'jwt-nuevo');

    await authApi.getMe(source);

    expect(renew).toHaveBeenCalledTimes(1);
    expect(api.calls[0]?.headers.authorization).toBe('Bearer jwt-nuevo');
  });

  it('ante 401 no-autenticado renueva y reintenta una sola vez', async () => {
    const api = installFakeAuthApi({ 'GET /me': [() => problem(401, 'no-autenticado'), meOk] });
    const { source, renew } = tokenSource('jwt-vencido', 'jwt-nuevo');

    await expect(authApi.getMe(source)).resolves.toEqual(USER);

    expect(renew).toHaveBeenCalledTimes(1);
    expect(api.calls.map((call) => call.headers.authorization)).toEqual(['Bearer jwt-vencido', 'Bearer jwt-nuevo']);
  });

  it('si el reintento también da 401, no hay un tercer intento', async () => {
    const api = installFakeAuthApi({ 'GET /me': () => problem(401, 'no-autenticado') });
    const { source, renew } = tokenSource('jwt', 'jwt-nuevo', 'otro');

    await expect(authApi.getMe(source)).rejects.toMatchObject({ kind: 'no-autenticado' });

    expect(renew).toHaveBeenCalledTimes(1);
    expect(api.count('GET /me')).toBe(2);
  });

  it.each([
    [403, 'acceso-denegado'],
    [429, 'demasiados-intentos'],
    [503, 'servicio-saturado'],
    [500, 'error-interno'],
  ])('%i %s no renueva ni reintenta', async (status, kind) => {
    const api = installFakeAuthApi({ 'GET /me': () => problem(status, kind) });
    const { source, renew } = tokenSource('jwt');

    await expect(authApi.getMe(source)).rejects.toMatchObject({ kind });

    expect(renew).not.toHaveBeenCalled();
    expect(api.count('GET /me')).toBe(1);
  });

  it.each(['credenciales-invalidas', 'desafio-requerido'])('el 401 %s de login no provoca renovación', async (kind) => {
    const api = installFakeAuthApi({ 'POST /login': () => problem(401, kind) });

    await expect(authApi.login({ correo: 'c', password: 'p' })).rejects.toMatchObject({ kind });

    expect(api.routes()).toEqual(['POST /login']);
  });
});
