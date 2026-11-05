import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { AuthMetrics } from './auth-metrics';

/** Ruta única del servidor interno de métricas. */
export const METRICS_PATH = '/metrics';

/**
 * Servidor HTTP **interno** de métricas (T-47, DEC-25). Escucha en `METRICS_HOST:METRICS_PORT`, separado
 * de la API pública: `GET /metrics` y nada más (otras rutas 404, otros métodos 405). La API pública no
 * expone métricas. Con `METRICS_PORT=0` no se inicia. El puerto no debe publicarse fuera de la red
 * interna del despliegue (checklist de despliegue, `docs/operacion/autenticacion.md`).
 */
export class MetricsServer {
  private server: Server | undefined;

  constructor(private readonly metrics: AuthMetrics) {}

  async listen(port: number, host: string): Promise<AddressInfo> {
    const server = createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== METRICS_PATH) {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' }).end();
        return;
      }
      this.metrics.render().then(
        (body) => res.writeHead(200, { 'Content-Type': this.metrics.contentType, 'Cache-Control': 'no-store' }).end(body),
        () => res.writeHead(500).end(),
      );
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve());
    });
    return server.address() as AddressInfo;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** Ciclo de vida en la API: inicia el servidor interno si `METRICS_PORT` > 0 y lo cierra al apagar. */
@Injectable()
export class MetricsServerLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('MetricsServer');
  private readonly server: MetricsServer;

  constructor(
    private readonly metrics: AuthMetrics,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {
    this.server = new MetricsServer(metrics);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.metrics.port === 0) return;
    this.metrics.enableProcessMetrics();
    const address = await this.server.listen(this.config.metrics.port, this.config.metrics.host);
    this.logger.log(`Métricas internas en ${address.address}:${address.port}${METRICS_PATH}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.server.close();
  }
}
