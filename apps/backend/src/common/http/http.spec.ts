import { BadRequestException, NotFoundException, type ArgumentMetadata, type ArgumentsHost } from '@nestjs/common';
import { LoginDto } from '../../auth/dto/login.dto';
import { readRefreshCookie, REFRESH_COOKIE, refreshCookieOptions } from '../../auth/refresh-cookie';
import {
  ChallengeRequiredError,
  InvalidCredentialsError,
  ServiceUnavailableError,
  TooManyAttemptsError,
} from '../auth-errors';
import type { HttpResponse } from './http-types';
import { ProblemException } from './problem';
import { ProblemJsonFilter } from './problem-json.filter';
import { createValidationPipe } from './validation';

class CapturingResponse implements HttpResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  body: unknown;
  status(code: number): this {
    this.statusCode = code;
    return this;
  }
  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }
  json(body: unknown): void {
    this.body = body;
  }
  cookie(): void {}
  clearCookie(): void {}
}

function filterResult(exception: unknown): CapturingResponse {
  const response = new CapturingResponse();
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new ProblemJsonFilter().catch(exception, host);
  return response;
}

// DEC-21 / plan §8: errores application/problem+json sin información sensible.
describe('ProblemJsonFilter', () => {
  it('429 con Retry-After y cuerpo genérico', () => {
    const r = filterResult(new TooManyAttemptsError(42));
    expect(r.statusCode).toBe(429);
    expect(r.headers['retry-after']).toBe('42');
    expect(r.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(r.body).toEqual({
      type: 'urn:omr-preicfes:problema:demasiados-intentos',
      title: expect.any(String) as string,
      status: 429,
    });
  });

  it('503 con el tipo de la causa y Retry-After', () => {
    for (const type of ['limitador-no-disponible', 'servicio-saturado', 'verificacion-no-disponible'] as const) {
      const r = filterResult(new ServiceUnavailableError(type, 5));
      expect(r.statusCode).toBe(503);
      expect(r.headers['retry-after']).toBe('5');
      expect(r.body).toMatchObject({ type: `urn:omr-preicfes:problema:${type}`, status: 503 });
    }
  });

  it('401 desafio-requerido y 401 genérico de credenciales', () => {
    expect(filterResult(new ChallengeRequiredError()).body).toMatchObject({
      type: 'urn:omr-preicfes:problema:desafio-requerido',
      status: 401,
    });
    expect(filterResult(new InvalidCredentialsError()).body).toMatchObject({
      type: 'urn:omr-preicfes:problema:credenciales-invalidas',
      status: 401,
    });
  });

  it('excepciones de Nest y errores no previstos: sin mensaje original ni traza', () => {
    const notFound = filterResult(new NotFoundException('Cannot GET /api/v1/secreto'));
    expect(notFound.statusCode).toBe(404);
    expect(JSON.stringify(notFound.body)).not.toContain('secreto');

    const internal = filterResult(new Error('mongodb://usuario:clave@host fallo'));
    expect(internal.statusCode).toBe(500);
    expect(internal.headers['retry-after']).toBeUndefined();
    expect(JSON.stringify(internal.body)).not.toMatch(/mongodb|clave|stack/);
    expect(internal.body).toEqual({ type: 'urn:omr-preicfes:problema:error-interno', title: 'Error interno', status: 500 });
  });

  it('sin RedactingLogger instalado, el log del filtro tampoco contiene las credenciales (T-10)', () => {
    const written: string[] = [];
    const capture = (chunk: unknown): boolean => {
      written.push(typeof chunk === 'string' ? chunk : String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    try {
      filterResult(new Error('mongodb://usuario:clave@host fallo'));
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    const logs = written.join('');
    expect(logs).toContain('Error: mongodb://[REDACTADO]@host fallo');
    expect(logs).not.toMatch(/usuario|clave/);
    expect(logs).toContain('http.spec.ts'); // la traza se conserva
  });
});

describe('ValidationPipe global (DEC-21)', () => {
  const pipe = createValidationPipe();
  const meta: ArgumentMetadata = { type: 'body', metatype: LoginDto, data: '' };

  async function rejection(value: unknown): Promise<ProblemException> {
    try {
      await pipe.transform(value, meta);
    } catch (error) {
      if (error instanceof ProblemException) return error;
      throw error;
    }
    throw new Error('se esperaba un rechazo');
  }

  it('acepta un cuerpo válido y devuelve una instancia de la clase DTO', async () => {
    const out: unknown = await pipe.transform({ correo: 'a@example.test', password: 'x'.repeat(12) }, meta);
    expect(out).toBeInstanceOf(LoginDto);
  });

  it('propiedad no declarada (p. ej. rol) → 400 con el campo y sin el valor', async () => {
    const error = await rejection({ correo: 'a@example.test', password: 'secreto-no-visible', rol: 'ADMIN' });
    expect(error.getStatus()).toBe(400);
    expect(error.errores).toEqual([{ campo: 'rol', reglas: ['whitelistValidation'] }]);
    expect(JSON.stringify(error.errores)).not.toMatch(/ADMIN|secreto-no-visible/);
  });

  it('tipos incorrectos → 400 sin conversión implícita', async () => {
    const error = await rejection({ correo: 123, password: true });
    expect(error.errores?.map((e) => e.campo).sort()).toEqual(['correo', 'password']);
  });

  it('cuerpo que no es un objeto o vacío → 400', async () => {
    await expect(rejection([])).resolves.toBeInstanceOf(ProblemException);
    await expect(rejection(undefined)).resolves.toBeInstanceOf(ProblemException);
  });

  it('una BadRequestException ajena no expone su mensaje', () => {
    const r = filterResult(new BadRequestException('detalle interno'));
    expect(JSON.stringify(r.body)).not.toContain('detalle interno');
  });
});

describe('cookie de renovación (DEC-01)', () => {
  const token = 'A'.repeat(43);

  it('atributos HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth', () => {
    expect(refreshCookieOptions()).toEqual({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth' });
  });

  it('lee solo un valor con formato de token', () => {
    expect(readRefreshCookie({ method: 'POST', headers: { cookie: `x=1; ${REFRESH_COOKIE}=${token}` } })).toBe(token);
    expect(readRefreshCookie({ method: 'POST', headers: {} })).toBeUndefined();
    expect(readRefreshCookie({ method: 'POST', headers: { cookie: `${REFRESH_COOKIE}=corto` } })).toBeUndefined();
    expect(
      readRefreshCookie({ method: 'POST', headers: { cookie: `${REFRESH_COOKIE}=${token}; ${REFRESH_COOKIE}=${'B'.repeat(43)}` } }),
    ).toBeUndefined();
  });
});
