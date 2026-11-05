import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthMetrics } from './auth-metrics';

/** Prefijo de las rutas de autenticación que se miden (T-47). */
export const AUTH_ROUTE_PREFIX = '/api/v1/auth';

/** Ruta no reconocida por el router: una sola etiqueta para no crear series por URL. */
export const UNKNOWN_ROUTE = 'desconocida';

const problemTypes = new WeakMap<object, string>();

/** El filtro problem+json anota el tipo de problema de la respuesta para las métricas. */
export function setProblemType(res: object, type: string): void {
  problemTypes.set(res, type);
}

interface RoutedRequest extends IncomingMessage {
  readonly originalUrl?: string;
  /** Express asigna la ruta que coincidió (plantilla, sin valores). */
  readonly route?: { readonly path?: unknown };
}

/**
 * Middleware de métricas HTTP (T-47, DEC-25): al terminar cada respuesta de `/api/v1/auth`, cuenta
 * `ruta` (la plantilla registrada en el router, nunca la URL recibida), `resultado` y `problema`.
 */
export function authMetricsMiddleware(metrics: AuthMetrics) {
  return (req: RoutedRequest, res: ServerResponse, next: () => void): void => {
    const url = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
    if (url === AUTH_ROUTE_PREFIX || url.startsWith(`${AUTH_ROUTE_PREFIX}/`)) {
      res.once('finish', () => {
        const path = req.route?.path;
        const ruta = typeof path === 'string' && path.startsWith(AUTH_ROUTE_PREFIX) ? path : UNKNOWN_ROUTE;
        metrics.recordRequest(ruta, res.statusCode, problemTypes.get(res));
      });
    }
    next();
  };
}
