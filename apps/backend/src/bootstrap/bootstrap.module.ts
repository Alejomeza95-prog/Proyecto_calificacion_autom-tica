import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { AppConfigModule } from '../config/config.module';
import { DatabaseModule } from '../database/database.module';
import { BootstrapAdminService } from './bootstrap-admin.service';

/**
 * Contexto del comando `bootstrap:admin` (T-35): configuración validada, MongoDB y servicios de dominio,
 * **sin** controladores HTTP. `AppModule` no lo importa: ninguna ruta llega a `BootstrapAdminService`
 * (RN-14).
 */
@Module({
  imports: [AppConfigModule, DatabaseModule, AuthCoreModule],
  providers: [BootstrapAdminService],
  exports: [BootstrapAdminService],
})
export class BootstrapModule {}
