import { Module } from '@nestjs/common';
import { AuthCoreModule } from './auth/auth-core.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MetricsServerLifecycle } from './observability/metrics-server';

/**
 * Módulo raíz. `AppConfigModule` valida la configuración al arrancar (si falta una variable, la API no
 * arranca, RNF-04); `DatabaseModule` conecta MongoDB sin crear índices (DEC-12); `AuthCoreModule` aporta
 * los servicios de autenticación y el cliente Redis del limitador (HT-AUTH-01, T-14); `AuthModule` agrega
 * las rutas `/auth`, los guards globales, el `ValidationPipe` y los errores problem+json (T-17, T-19).
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, AuthCoreModule, AuthModule],
  controllers: [HealthController],
  // Servidor interno de métricas (T-47, DEC-25); el CLI `bootstrap:admin` no lo usa.
  providers: [MetricsServerLifecycle],
})
export class AppModule {}
