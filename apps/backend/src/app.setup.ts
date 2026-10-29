import type { INestApplication } from '@nestjs/common';

/** Prefijo global de la API (plan HT-CORE-01 §8 y §9.8, DEC-15). */
export const API_PREFIX = 'api/v1';

/** Configuración común a `main.ts` y a las pruebas E2E, para que ambas expongan las mismas rutas. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
}
