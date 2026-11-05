import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenService } from '../authz/access-token.service';
import { JwtAuthGuard, OriginGuard, RolesGuard } from '../authz/guards';
import { InstitutionScopePolicy } from '../authz/institution-scope.policy';
import { ProblemJsonFilter } from '../common/http/problem-json.filter';
import { createValidationPipe } from '../common/http/validation';
import { INVITATION_RESOLVER, NoInvitationResolver } from '../invitations/invitation-resolver';
import { AuthAccountService } from './auth-account.service';
import { AuthCoreModule } from './auth-core.module';
import { AuthSessionService } from './auth-session.service';
import { AuthController } from './auth.controller';

/**
 * Capa HTTP de autenticación y autorización (Fase 3 de HT-AUTH-01: T-17 y T-19).
 * Guards globales en este orden: `OriginGuard` (DEC-20, antes de cualquier efecto) → `JwtAuthGuard`
 * (salvo `@Public()`) → `RolesGuard`. `ValidationPipe` global de DEC-21 y errores problem+json.
 * El secreto y la vigencia del JWT se pasan en cada firma desde la configuración validada.
 */
@Module({
  imports: [AuthCoreModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    AuthSessionService,
    AuthAccountService,
    { provide: INVITATION_RESOLVER, useFactory: () => new NoInvitationResolver() },
    InstitutionScopePolicy,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: ProblemJsonFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
  exports: [InstitutionScopePolicy, AccessTokenService],
})
export class AuthModule {}
