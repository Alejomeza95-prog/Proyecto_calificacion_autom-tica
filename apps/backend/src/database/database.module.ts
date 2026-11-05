import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditoriaAuth, AuditoriaAuthSchema } from '../audit/auditoria-auth.schema';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { TokenSeguridad, TokenSeguridadSchema } from '../security-tokens/token-seguridad.schema';
import { Sesion, SesionSchema } from '../sessions/sesion.schema';
import { Usuario, UsuarioSchema } from '../users/usuario.schema';

const models = MongooseModule.forFeature([
  { name: Usuario.name, schema: UsuarioSchema },
  { name: TokenSeguridad.name, schema: TokenSeguridadSchema },
  { name: Sesion.name, schema: SesionSchema },
  { name: AuditoriaAuth.name, schema: AuditoriaAuthSchema },
]);

/**
 * Conexión MongoDB (plan §7, DEC-12): `autoIndex: false` y `autoCreate: false`, sin `syncIndexes()`.
 * Los índices y colecciones solo los crea `pnpm migrate:up`.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => ({
        uri: config.mongodbUri,
        autoIndex: false,
        autoCreate: false,
        serverSelectionTimeoutMS: 10_000,
      }),
    }),
    models,
  ],
  exports: [models],
})
export class DatabaseModule {}
