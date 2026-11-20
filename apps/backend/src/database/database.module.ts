import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClaveRespuesta, ClaveRespuestaSchema } from '../answer-keys/clave-respuesta.schema';
import { AuditoriaAdmin, AuditoriaAdminSchema } from '../audit/auditoria-admin.schema';
import { AuditoriaAuth, AuditoriaAuthSchema } from '../audit/auditoria-auth.schema';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { Institucion, InstitucionSchema } from '../instituciones/institucion.schema';
import { ResolucionManual, ResolucionManualSchema } from '../manual-review/resolucion-manual.schema';
import { Prueba, PruebaSchema } from '../pruebas/prueba.schema';
import { TokenSeguridad, TokenSeguridadSchema } from '../security-tokens/token-seguridad.schema';
import { Sesion, SesionSchema } from '../sessions/sesion.schema';
import { Usuario, UsuarioSchema } from '../users/usuario.schema';

const models = MongooseModule.forFeature([
  { name: Usuario.name, schema: UsuarioSchema },
  { name: TokenSeguridad.name, schema: TokenSeguridadSchema },
  { name: Sesion.name, schema: SesionSchema },
  { name: AuditoriaAuth.name, schema: AuditoriaAuthSchema },
  // HT-AUTH-03 (plan §3).
  { name: Institucion.name, schema: InstitucionSchema },
  { name: Prueba.name, schema: PruebaSchema },
  { name: ClaveRespuesta.name, schema: ClaveRespuestaSchema },
  { name: AuditoriaAdmin.name, schema: AuditoriaAdminSchema },
  { name: ResolucionManual.name, schema: ResolucionManualSchema },
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
