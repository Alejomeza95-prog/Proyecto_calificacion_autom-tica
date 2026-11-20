import { Module } from '@nestjs/common';
import { AdminUsersController } from '../admin-users/admin-users.controller';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { AnswerKeysController } from '../answer-keys/answer-keys.controller';
import { AnswerKeysService } from '../answer-keys/answer-keys.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { InstitutionScopePolicy } from '../authz/institution-scope.policy';
import { InstitucionesController } from '../instituciones/instituciones.controller';
import { ManualReviewService } from '../manual-review/manual-review.service';
import { PruebasController } from '../pruebas/pruebas.controller';
import { PruebasService } from '../pruebas/pruebas.service';

/**
 * Funcionalidades de HT-AUTH-03 (plan §2.1): panel de usuarios, instituciones, pruebas, claves de respuesta
 * y revisión manual (solo servicio, DEC-07). Los modelos vienen de `DatabaseModule` (global) y los guards
 * globales de `AuthModule` protegen todas las rutas.
 */
@Module({
  controllers: [AdminUsersController, InstitucionesController, PruebasController, AnswerKeysController],
  providers: [
    AdminAuditService,
    InstitutionScopePolicy,
    AdminUsersService,
    PruebasService,
    AnswerKeysService,
    ManualReviewService,
  ],
  exports: [ManualReviewService],
})
export class AdministrationModule {}
