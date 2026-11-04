import type { NestExpressApplication } from '@nestjs/platform-express';
import { RedactingLogger } from './audit/redacting-logger';
import type { AuthConfig } from './config/auth-config';
import { AUTH_CONFIG } from './config/config.module';

/** Prefijo global de la API (plan HT-CORE-01 §8 y §9.8, DEC-15). */
export const API_PREFIX = 'api/v1';

/** Configuración común a `main.ts` y a las pruebas E2E, para que ambas expongan las mismas rutas. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AuthConfig>(AUTH_CONFIG);
  // Logger con redacción de secretos (HT-AUTH-01 plan §11, T-10).
  app.useLogger(new RedactingLogger());
  // IP real solo a través de TRUST_PROXY_HOPS proxies confiables; con 0, se ignora X-Forwarded-For (plan §11).
  app.set('trust proxy', config.trustProxyHops > 0 ? config.trustProxyHops : false);
  app.disable('x-powered-by');
  // CORS con la lista explícita de AUTH_ALLOWED_ORIGINS y credenciales; nunca `*` (DEC-20).
  app.enableCors({
    origin: [...config.authAllowedOrigins],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
}
