import { describe, expect, it } from 'vitest';
import { problem } from '../../../test/fake-auth-api.ts';
import { isApiError, parseRetryAfter, problemFromResponse } from './problem.ts';

describe('problemFromResponse', () => {
  it.each([
    [400, 'solicitud-invalida'],
    [401, 'no-autenticado'],
    [401, 'credenciales-invalidas'],
    [401, 'desafio-requerido'],
    [403, 'acceso-denegado'],
    [403, 'origen-no-permitido'],
    [404, 'no-encontrado'],
    [400, 'enlace-invalido'],
    [422, 'politica-password'],
    [429, 'demasiados-intentos'],
    [503, 'limitador-no-disponible'],
    [503, 'servicio-saturado'],
    [503, 'verificacion-no-disponible'],
    [500, 'error-interno'],
  ])('interpreta %i %s', async (status, kind) => {
    const error = await problemFromResponse(problem(status, kind, { title: 'Título del backend' }));

    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.title).toBe('Título del backend');
    expect(isApiError(error, error.kind)).toBe(true);
  });

  it('lee Retry-After de 429 y 503', async () => {
    const limited = await problemFromResponse(problem(429, 'demasiados-intentos', { retryAfter: '42' }));
    const saturated = await problemFromResponse(problem(503, 'servicio-saturado', { retryAfter: '7' }));

    expect(limited.retryAfterSeconds).toBe(42);
    expect(saturated.retryAfterSeconds).toBe(7);
  });

  it('sin Retry-After no inventa una espera', async () => {
    expect((await problemFromResponse(problem(429, 'demasiados-intentos'))).retryAfterSeconds).toBeNull();
  });

  it('de errores[] conserva el campo y descarta las reglas internas', async () => {
    const error = await problemFromResponse(
      problem(400, 'solicitud-invalida', {
        errores: [{ campo: 'correo', reglas: ['isEmail'] }, { campo: 'nombre', reglas: ['maxLength'] }, { sinCampo: 1 }],
      }),
    );

    expect(error.fields).toEqual(['correo', 'nombre']);
    expect(JSON.stringify(error)).not.toContain('isEmail');
  });

  it('un tipo desconocido no se confunde con uno del contrato', async () => {
    const error = await problemFromResponse(problem(418, 'tipo-futuro', { title: 'No mostrar' }));

    expect(error.kind).toBe('desconocido');
    expect(error.title).toBeNull();
  });

  it('una respuesta que no es problem+json queda como desconocido y conserva el estado', async () => {
    const html = new Response('<html>Bad gateway con correo@example.test</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html', 'Retry-After': '5' },
    });

    const error = await problemFromResponse(html);

    expect(error).toMatchObject({ kind: 'desconocido', status: 502, retryAfterSeconds: 5 });
    expect(`${error.message} ${JSON.stringify(error)}`).not.toContain('correo@example.test');
  });

  it('un problem+json ilegible queda como desconocido', async () => {
    const broken = new Response('{no es json', {
      status: 500,
      headers: { 'Content-Type': 'application/problem+json' },
    });

    expect((await problemFromResponse(broken)).kind).toBe('desconocido');
  });
});

describe('parseRetryAfter', () => {
  it.each([
    ['1', 1],
    [' 30 ', 30],
    ['0', null],
    ['-5', null],
    ['1.5', null],
    ['Wed, 21 Oct 2026 07:28:00 GMT', null],
    ['', null],
    [null, null],
    ['99999999999999999999', null],
  ])('%s → %s', (value, expected) => {
    expect(parseRetryAfter(value)).toBe(expected);
  });
});
