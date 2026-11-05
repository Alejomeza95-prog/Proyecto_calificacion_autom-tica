import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import {
  CaptchaProviderError,
  TURNSTILE_SITEVERIFY_URL,
  TurnstileCaptchaVerifier,
  type FetchLike,
} from '../../src/captcha/turnstile-captcha-verifier';
import { ChallengeRequiredError, ServiceUnavailableError } from '../../src/common/auth-errors';
import { AuthRateLimitService } from '../../src/common/rate-limit/auth-rate-limit.service';
import { bootAuthCore, type AuthCoreHarness } from '../support/auth-core';

const SECRET = 'secreto-turnstile-simulado-0123456789';
const VALID = 'token-valido-simulado.0123456789abcdefghijklmnopqrstuvwxyz';
const CONTEXT = { action: 'login', remoteIp: '198.51.100.20' } as const;

type Behaviour = (req: IncomingMessage, body: URLSearchParams, res: ServerResponse) => void;

/**
 * Servidor Siteverify simulado en 127.0.0.1 (T-41, DEC-24). El adaptador conserva su endpoint fijo: el
 * `fetch` inyectado comprueba que se pidió ese endpoint y redirige la solicitud a este servidor.
 */
class FakeSiteverify {
  private server!: Server;
  behaviour: Behaviour = (_req, body, res) => this.standard(body, res);
  readonly requests: URLSearchParams[] = [];
  readonly used = new Set<string>();

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
      req.on('end', () => {
        const body = new URLSearchParams(raw);
        this.requests.push(body);
        this.behaviour(req, body, res);
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  get url(): string {
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/turnstile/v0/siteverify`;
  }

  /** Comportamiento del proveedor: secreto, token de un solo uso, hostname y acción. */
  standard(body: URLSearchParams, res: ServerResponse, overrides: Record<string, unknown> = {}): void {
    const token = body.get('response') ?? '';
    let reply: Record<string, unknown>;
    if (!body.get('secret')) reply = { success: false, 'error-codes': ['missing-input-secret'] };
    else if (body.get('secret') !== SECRET) reply = { success: false, 'error-codes': ['invalid-input-secret'] };
    else if (this.used.has(token)) reply = { success: false, 'error-codes': ['timeout-or-duplicate'] };
    else if (!token.startsWith('token-valido')) reply = { success: false, 'error-codes': ['invalid-input-response'] };
    else {
      this.used.add(token);
      reply = { success: true, challenge_ts: new Date().toISOString(), hostname: 'localhost', action: 'login', 'error-codes': [] };
    }
    this.json(res, 200, { ...reply, ...overrides });
  }

  json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

describe('Turnstile contra un Siteverify simulado (T-41, integración)', () => {
  const fake = new FakeSiteverify();
  const logs: string[] = [];
  let redirect: FetchLike;
  const adapter = (secret = SECRET, timeoutMs = 2_000) =>
    new TurnstileCaptchaVerifier({ secret, expectedHostnames: ['localhost'], timeoutMs }, redirect);

  beforeAll(async () => {
    await fake.start();
    redirect = (url, init) => {
      if (url !== TURNSTILE_SITEVERIFY_URL) throw new Error('endpoint inesperado');
      return fetch(fake.url, init);
    };
    for (const level of ['log', 'error', 'warn'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await fake.stop();
    // Ningún log contiene el secreto ni los tokens enviados.
    for (const line of logs) {
      expect(line).not.toContain(SECRET);
      expect(line).not.toContain('token-');
    }
  });

  beforeEach(() => {
    fake.behaviour = (_req, body, res) => fake.standard(body, res);
  });

  it('token válido → true una vez; el mismo token reutilizado → false (timeout-or-duplicate)', async () => {
    const token = `${VALID}-1`;
    await expect(adapter().verify(token, CONTEXT)).resolves.toBe(true);
    await expect(adapter().verify(token, CONTEXT)).resolves.toBe(false);
    const sent = fake.requests.at(-1)!;
    expect([...sent.keys()].sort()).toEqual(['response', 'secret']);
  });

  it('token inválido → false', async () => {
    await expect(adapter().verify('token-falso', CONTEXT)).resolves.toBe(false);
  });

  it('hostname o acción incorrectos → false', async () => {
    fake.behaviour = (_req, body, res) => fake.standard(body, res, { hostname: 'evil.example.test' });
    await expect(adapter().verify(`${VALID}-2`, CONTEXT)).resolves.toBe(false);
    fake.behaviour = (_req, body, res) => fake.standard(body, res, { action: 'register' });
    await expect(adapter().verify(`${VALID}-3`, CONTEXT)).resolves.toBe(false);
  });

  it('secreto ausente o inválido → CaptchaProviderError (configuración, fallo cerrado)', async () => {
    await expect(adapter('').verify(`${VALID}-4`, CONTEXT)).rejects.toMatchObject({ reason: 'codigos:missing-input-secret' });
    await expect(adapter('otro-secreto').verify(`${VALID}-5`, CONTEXT)).rejects.toMatchObject({ reason: 'codigos:invalid-input-secret' });
  });

  it('HTTP 500, JSON inválido e internal-error → CaptchaProviderError', async () => {
    fake.behaviour = (_req, _body, res) => fake.json(res, 500, { success: true });
    await expect(adapter().verify(`${VALID}-6`, CONTEXT)).rejects.toMatchObject({ reason: 'http-500' });
    fake.behaviour = (_req, _body, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end('{no es json');
    await expect(adapter().verify(`${VALID}-7`, CONTEXT)).rejects.toMatchObject({ reason: 'respuesta-no-validable' });
    fake.behaviour = (_req, _body, res) => fake.json(res, 200, { success: false, 'error-codes': ['internal-error'] });
    await expect(adapter().verify(`${VALID}-8`, CONTEXT)).rejects.toBeInstanceOf(CaptchaProviderError);
  });

  it('proveedor que no responde → tiempo agotado y una sola solicitud (sin reintentos)', async () => {
    const before = fake.requests.length;
    fake.behaviour = () => undefined; // nunca responde
    await expect(adapter(SECRET, 100).verify(`${VALID}-9`, CONTEXT)).rejects.toMatchObject({ reason: 'tiempo-agotado' });
    expect(fake.requests.length - before).toBe(1);
  });

  it('error de red (conexión rechazada) → CaptchaProviderError', async () => {
    const refused: FetchLike = (_url, init) => fetch('http://127.0.0.1:1/turnstile/v0/siteverify', init);
    const verifier = new TurnstileCaptchaVerifier({ secret: SECRET, expectedHostnames: ['localhost'], timeoutMs: 2_000 }, refused);
    await expect(verifier.verify(`${VALID}-10`, CONTEXT)).rejects.toMatchObject({ reason: 'error-de-red' });
  });

  describe('login con desafío y Turnstile simulado (AuthRateLimitService)', () => {
    let h: AuthCoreHarness;
    let limits: AuthRateLimitService;
    const IP = '198.51.100.30';
    const EMAIL = 'desafio.turnstile@example.test';

    beforeAll(async () => {
      h = await bootAuthCore('turnstile', {
        env: { RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT: '2/15m', CAPTCHA_VERIFY_TIMEOUT_MS: '2000' },
        captchaVerifier: adapter(),
      });
      limits = h.moduleRef.get(AuthRateLimitService);
      const wrong = () => Promise.resolve(false);
      for (let i = 0; i < 2; i += 1) {
        await limits.guardLogin({ ip: IP, correoNormalizado: EMAIL }, wrong).catch(() => undefined);
      }
    }, 60_000);

    afterAll(async () => {
      await h?.close();
    });

    const counters = async () =>
      Promise.all(
        ['rl:login-failure:*', 'rl:login-challenge:*'].map(async (pattern) => {
          const keys = (await h.redisKeys(pattern)).filter((k) => !k.endsWith(':auditado'));
          const values = await Promise.all(keys.map((k) => h.redis.get(k)));
          return values.reduce((sum, v) => sum + Number(v ?? 0), 0);
        }),
      );

    it('CAPTCHA inválido → desafio-requerido sin Argon2id; válido → entra', async () => {
      const check = jest.fn(() => Promise.resolve(true));
      await expect(limits.guardLogin({ ip: IP, correoNormalizado: EMAIL, captchaToken: 'token-falso' }, check)).rejects.toBeInstanceOf(
        ChallengeRequiredError,
      );
      expect(check).not.toHaveBeenCalled();
      await expect(limits.guardLogin({ ip: IP, correoNormalizado: EMAIL, captchaToken: `${VALID}-11` }, check)).resolves.toBeUndefined();
      expect(check).toHaveBeenCalledTimes(1);
    });

    it('proveedor con HTTP 503 → 503 verificacion-no-disponible sin Argon2id ni cambios en contadores', async () => {
      fake.behaviour = (_req, _body, res) => fake.json(res, 503, {});
      const before = await counters();
      const check = jest.fn(() => Promise.resolve(true));
      const error = await limits.guardLogin({ ip: IP, correoNormalizado: EMAIL, captchaToken: `${VALID}-12` }, check).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect(error).toMatchObject({ type: 'verificacion-no-disponible' });
      expect(check).not.toHaveBeenCalled();
      expect(await counters()).toEqual(before);
    });
  });
});
