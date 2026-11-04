import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock';
import { loadAuthConfig } from './auth-config';

/** Token de inyección de la configuración validada (T-11). */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

/**
 * Valida la configuración al construir el módulo: si falta una variable o tiene formato
 * inválido, la aplicación no arranca (RNF-04).
 */
@Global()
@Module({
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfig(process.env) },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [AUTH_CONFIG, CLOCK],
})
export class AppConfigModule {}
