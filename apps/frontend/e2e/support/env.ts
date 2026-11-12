/** Datos del entorno aislado de cada ejecución (`isolated-backend.mjs`, DEC-14). Ninguno sirve fuera de esa base local. */
export const APP_ORIGIN = 'http://localhost:5174';
/** Vite hacia el backend de activación, que usa una base nueva en cada ejecución. */
export const ACTIVATION_ORIGIN = 'http://localhost:5175';
/** Proxy HTTPS de pruebas hacia `APP_ORIGIN`, para WebKit (DEC-12). */
export const TLS_ORIGIN = 'https://localhost:5443';
/** Backends de la ejecución; coinciden con `isolated-backend.mjs` (3100/3101 quedan para los contenedores de DEC-13). */
export const BACKEND_ORIGIN = 'http://127.0.0.1:3200';
export const ACTIVATION_BACKEND_ORIGIN = 'http://127.0.0.1:3201';
export const API_DIRECT = `${BACKEND_ORIGIN}/api/v1/auth`;
export const SEED_ADMIN = { correo: 'admin.seed@example.test', password: 'solo-e2e-local-sin-valor-real' } as const;

/** Correo único por prueba; `@example.test` no entrega mensajes reales. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}
