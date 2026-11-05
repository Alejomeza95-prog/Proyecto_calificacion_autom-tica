import type { IncomingMessage, ServerResponse } from 'node:http';
import { testEnv } from '../../test/support/test-env';
import { RedactingLogger } from '../audit/redacting-logger';
import { ConfigValidationError, loadAuthConfig } from '../config/auth-config';
import { AuthMetrics, resultForStatus } from './auth-metrics';
import { MetricsServer } from './metrics-server';
import { CORRELATION_HEADER, correlationIdMiddleware, currentCorrelationId, runWithRequestContext } from './request-context';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function problemsOf(overrides: Record<string, string | undefined>): string[] {
  try {
    loadAuthConfig(testEnv({ MONGODB_URI: 'mongodb://h/db', REDIS_URL: 'redis://h:6379', ...overrides }));
    return [];
  } catch (error) {
    if (error instanceof ConfigValidationError) return [...error.problems];
    throw error;
  }
}

// T-47 (DEC-25): correlationId, logs JSON y métricas sin datos personales.
describe('observabilidad (T-47)', () => {
  describe('correlationId', () => {
    it('el middleware genera un UUID en el servidor, lo devuelve en X-Request-Id e ignora el del cliente', () => {
      const headers: Record<string, string> = {};
      const res = { setHeader: (k: string, v: string) => (headers[k] = v) } as unknown as ServerResponse;
      const req = { headers: { 'x-request-id': '../../etc/passwd\nfalso' } } as unknown as IncomingMessage;
      let seen: string | undefined;
      correlationIdMiddleware(req, res, () => {
        seen = currentCorrelationId();
      });
      expect(seen).toMatch(UUID_V4);
      expect(headers[CORRELATION_HEADER]).toBe(seen);
      expect(currentCorrelationId()).toBeUndefined();
    });

    it('el contexto se conserva en continuaciones asíncronas (setImmediate, promesas) y no se mezcla', async () => {
      const read = (id: string) =>
        runWithRequestContext({ correlationId: id }, async () => {
          await new Promise<void>((r) => setImmediate(r));
          await Promise.resolve();
          return currentCorrelationId();
        });
      await expect(Promise.all([read('a'), read('b')])).resolves.toEqual(['a', 'b']);
    });
  });

  describe('logs estructurados', () => {
    it('cada registro es una línea JSON con correlationId, y la redacción ocurre antes de serializar', () => {
      const lines: string[] = [];
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        lines.push(String(chunk));
        return true;
      });
      try {
        const logger = new RedactingLogger();
        runWithRequestContext({ correlationId: 'id-de-prueba' }, () =>
          logger.log('envío a persona@example.test con Bearer abc.def.ghi', 'Prueba'),
        );
        logger.log('sin solicitud', 'Prueba');
      } finally {
        spy.mockRestore();
      }
      const records = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(records[0]).toMatchObject({ level: 'log', context: 'Prueba', correlationId: 'id-de-prueba' });
      expect(JSON.stringify(records[0])).not.toContain('persona@example.test');
      expect(JSON.stringify(records[0])).not.toContain('abc.def.ghi');
      expect(records[1]).not.toHaveProperty('correlationId');
    });
  });

  describe('métricas', () => {
    it('etiquetas acotadas: ruta, resultado y problema; argon2 se lee de Argon2Gate sin duplicar contadores', async () => {
      const metrics = new AuthMetrics({ metrics: () => ({ active: 2, queued: 3, rejected: 4, maxObservedActive: 5 }) });
      metrics.recordRequest('/api/v1/auth/login', 401, 'credenciales-invalidas');
      metrics.recordRequest('/api/v1/auth/login', 200);
      metrics.recordCaptcha('no_disponible');
      metrics.recordMail('fallido');
      const text = await metrics.render();
      expect(text).toContain('omr_auth_solicitudes_total{ruta="/api/v1/auth/login",resultado="error_cliente",problema="credenciales-invalidas"} 1');
      expect(text).toContain('omr_auth_solicitudes_total{ruta="/api/v1/auth/login",resultado="exito",problema="ninguno"} 1');
      expect(text).toContain('omr_auth_captcha_verificaciones_total{resultado="no_disponible"} 1');
      expect(text).toContain('omr_auth_correos_total{resultado="fallido"} 1');
      expect(text).toContain('omr_auth_argon2_en_cola 3');
      expect(text).toContain('omr_auth_argon2_rechazadas 4');
      const labelNames = new Set([...text.matchAll(/[{,]([a-z_]+)="/g)].map((m) => m[1]));
      expect([...labelNames].sort()).toEqual(['problema', 'resultado', 'ruta']);
    });

    it('resultado por clase de estado', () => {
      expect([200, 202, 204, 400, 401, 429, 500, 503].map(resultForStatus)).toEqual([
        'exito',
        'exito',
        'exito',
        'error_cliente',
        'error_cliente',
        'error_cliente',
        'error_servidor',
        'error_servidor',
      ]);
    });

    it('servidor interno: solo GET /metrics; otras rutas 404 y otros métodos 405', async () => {
      const metrics = new AuthMetrics();
      metrics.recordMail('enviado');
      const server = new MetricsServer(metrics);
      const { port } = await server.listen(0, '127.0.0.1');
      try {
        const base = `http://127.0.0.1:${port}`;
        const ok = await fetch(`${base}/metrics`);
        expect(ok.status).toBe(200);
        expect(ok.headers.get('content-type')).toContain('text/plain');
        expect(await ok.text()).toContain('omr_auth_correos_total{resultado="enviado"} 1');
        expect((await fetch(`${base}/`)).status).toBe(404);
        expect((await fetch(`${base}/api/v1/auth/me`)).status).toBe(404);
        expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(405);
      } finally {
        await server.close();
      }
    });

    it('configuración: METRICS_HOST es una IP, METRICS_PORT distinto del de la API, 0 deshabilita', () => {
      expect(problemsOf({ METRICS_HOST: 'metrics.example.test' }).join(' ')).toContain('METRICS_HOST');
      expect(problemsOf({ METRICS_HOST: undefined }).join(' ')).toContain('METRICS_HOST');
      expect(problemsOf({ METRICS_PORT: '3000' }).join(' ')).toContain('METRICS_PORT');
      expect(problemsOf({ METRICS_PORT: '8080', PORT: '8080' }).join(' ')).toContain('METRICS_PORT');
      expect(problemsOf({ METRICS_PORT: '70000' }).join(' ')).toContain('METRICS_PORT');
      expect(problemsOf({ METRICS_PORT: '9464', METRICS_HOST: '10.0.0.5' })).toEqual([]);
      expect(loadAuthConfig(testEnv({ MONGODB_URI: 'mongodb://h/db', REDIS_URL: 'redis://h:6379' })).metrics).toEqual({
        port: 0,
        host: '127.0.0.1',
      });
    });
  });
});
