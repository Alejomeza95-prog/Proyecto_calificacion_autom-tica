import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import type { AuthConfig } from '../config/auth-config';
import { AUTH_CONFIG } from '../config/config.module';
import { asegurarInstitucionPorDefecto, INSTITUCION_POR_DEFECTO } from './crear-institucion';

/**
 * Al arrancar la API en desarrollo crea {@link INSTITUCION_POR_DEFECTO} si no existe ninguna institución
 * (HT-AUTH-03 T-34). Un fallo no detiene el arranque: se registra y la institución puede crearse con
 * `pnpm instituciones:crear`.
 */
@Injectable()
export class InstitucionPorDefectoLifecycle implements OnApplicationBootstrap {
  private readonly logger = new Logger('InstitucionPorDefecto');

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const db = this.connection.db;
    if (!db) return;
    try {
      const resultado = await asegurarInstitucionPorDefecto(db, this.config.nodeEnv);
      if (resultado.accion === 'creada') {
        this.logger.log(`Catálogo de instituciones vacío: se creó «${INSTITUCION_POR_DEFECTO}» (${resultado.id})`);
      }
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo crear la institución por defecto: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
}
