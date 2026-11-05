import { Logger } from '@nestjs/common';
import {
  CaptchaProviderError,
  TURNSTILE_MAX_TOKEN_LENGTH,
  TURNSTILE_SITEVERIFY_URL,
  TurnstileCaptchaVerifier,
  type FetchLike,
} from './turnstile-captcha-verifier';

const SECRET = 'secreto-turnstile-de-prueba-0123456789';
const TOKEN = 'token-turnstile-de-prueba.ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789';
const CONTEXT = { action: 'login', remoteIp: '198.51.100.7' } as const;
const OK_BODY = { success: true, hostname: 'app.example.test', action: 'login', 'error-codes': [] };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function verifier(fetchFn: FetchLike, timeoutMs = 3_000): TurnstileCaptchaVerifier {
  return new TurnstileCaptchaVerifier({ secret: SECRET, expectedHostnames: ['APP.example.test', 'localhost'], timeoutMs }, fetchFn);
}

// T-41 (DEC-16, DEC-24): adaptador de Cloudflare Turnstile con `fetch` inyectado; sin red real.
describe('TurnstileCaptchaVerifier (T-41)', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    for (const level of ['log', 'error', 'warn', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(capture);
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Ningún log contiene el token ni el secreto.
    for (const line of logs) {
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain(TOKEN);
    }
  });

  it('envía un solo POST al endpoint fijo, como formulario, con secret y response, sin remoteip ni redirecciones', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>(() => Promise.resolve(jsonResponse(OK_BODY)));
    await expect(verifier(fetchFn).verify(TOKEN, CONTEXT)).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    const sentBody = init.body as string;
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const sent = new URLSearchParams(sentBody);
    expect([...sent.keys()].sort()).toEqual(['response', 'secret']);
    expect(sent.get('secret')).toBe(SECRET);
    expect(sent.get('response')).toBe(TOKEN);
    expect(sentBody).not.toContain(CONTEXT.remoteIp);
  });

  it('hostname distinto de los permitidos o acción distinta de login → false', async () => {
    for (const body of [
      { ...OK_BODY, hostname: 'evil.example.test' },
      { ...OK_BODY, hostname: undefined },
      { ...OK_BODY, action: 'register' },
      { ...OK_BODY, action: undefined },
    ]) {
      await expect(verifier(() => Promise.resolve(jsonResponse(body))).verify(TOKEN, CONTEXT)).resolves.toBe(false);
    }
  });

  it('el hostname se compara sin distinguir mayúsculas', async () => {
    const body = { ...OK_BODY, hostname: 'App.Example.Test' };
    await expect(verifier(() => Promise.resolve(jsonResponse(body))).verify(TOKEN, CONTEXT)).resolves.toBe(true);
  });

  it('token inválido, vencido o reutilizado (timeout-or-duplicate) → false, sin falla del proveedor', async () => {
    for (const codes of [['invalid-input-response'], ['timeout-or-duplicate'], ['missing-input-response']]) {
      const body = { success: false, 'error-codes': codes };
      await expect(verifier(() => Promise.resolve(jsonResponse(body))).verify(TOKEN, CONTEXT)).resolves.toBe(false);
    }
    expect(logs).toEqual([]);
  });

  it('token vacío o de más de 2048 caracteres → false sin llamar al proveedor', async () => {
    const fetchFn = jest.fn<Promise<Response>, Parameters<FetchLike>>(() => Promise.resolve(jsonResponse(OK_BODY)));
    await expect(verifier(fetchFn).verify('', CONTEXT)).resolves.toBe(false);
    await expect(verifier(fetchFn).verify('a'.repeat(TURNSTILE_MAX_TOKEN_LENGTH + 1), CONTEXT)).resolves.toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(verifier(fetchFn).verify('a'.repeat(TURNSTILE_MAX_TOKEN_LENGTH), CONTEXT)).resolves.toBe(true);
  });

  it('secreto ausente o inválido, solicitud mal formada, internal-error o códigos desconocidos → CaptchaProviderError (fallo cerrado)', async () => {
    for (const codes of [['missing-input-secret'], ['invalid-input-secret'], ['bad-request'], ['internal-error'], ['otro-codigo'], [], ['invalid-input-response', 'internal-error']]) {
      const body = { success: false, 'error-codes': codes };
      const error = await verifier(() => Promise.resolve(jsonResponse(body))).verify(TOKEN, CONTEXT).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CaptchaProviderError);
    }
    expect(logs.some((l) => l.includes('invalid-input-secret'))).toBe(true);
  });

  it('HTTP distinto de 2xx → CaptchaProviderError', async () => {
    for (const status of [400, 403, 500, 502, 503]) {
      const error = await verifier(() => Promise.resolve(jsonResponse(OK_BODY, status))).verify(TOKEN, CONTEXT).catch((e: unknown) => e);
      expect(error).toMatchObject({ name: 'CaptchaProviderError', reason: `http-${status}` });
    }
  });

  it('JSON inválido o con forma inesperada → CaptchaProviderError', async () => {
    const bodies = [
      new Response('<html>no es json</html>', { status: 200 }),
      jsonResponse({ hostname: 'app.example.test' }),
      jsonResponse({ success: 'true' }),
      jsonResponse({ success: false, 'error-codes': 'invalid-input-response' }),
      jsonResponse(null),
    ];
    for (const res of bodies) {
      const error = await verifier(() => Promise.resolve(res)).verify(TOKEN, CONTEXT).catch((e: unknown) => e);
      expect(error).toMatchObject({ name: 'CaptchaProviderError', reason: 'respuesta-no-validable' });
    }
  });

  it('error de red → CaptchaProviderError, sin el detalle del error en el log', async () => {
    const fetchFn: FetchLike = () => Promise.reject(new TypeError(`fetch failed ${SECRET}`));
    await expect(verifier(fetchFn).verify(TOKEN, CONTEXT)).rejects.toMatchObject({ reason: 'error-de-red' });
  });

  it('tiempo agotado: aborta la solicitud con la señal y lanza CaptchaProviderError (sin reintentos)', async () => {
    let calls = 0;
    const fetchFn: FetchLike = (_url, init) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error));
      });
    };
    await expect(verifier(fetchFn, 5).verify(TOKEN, CONTEXT)).rejects.toMatchObject({ reason: 'tiempo-agotado' });
    expect(calls).toBe(1);
  });

  it('ningún error expone el token ni el secreto en su mensaje', async () => {
    const body = { success: false, 'error-codes': [`invalid-input-secret ${SECRET}`] };
    const error = (await verifier(() => Promise.resolve(jsonResponse(body))).verify(TOKEN, CONTEXT).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(CaptchaProviderError);
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain(TOKEN);
  });
});
