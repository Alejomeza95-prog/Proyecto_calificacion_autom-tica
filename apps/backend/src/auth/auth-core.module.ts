import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AuditService } from '../audit/audit.service';
import { CAPTCHA_VERIFIER, TestCaptchaVerifier } from '../captcha/captcha-verifier';
import { AuthRateLimitService, RATE_LIMITER } from '../common/rate-limit/auth-rate-limit.service';
import { RedisRateLimiter } from '../common/rate-limit/redis-rate-limiter';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { LinkBuilder } from '../mail/link-builder';
import { MailDispatcher } from '../mail/mail-dispatcher';
import { MAIL_SENDER, NodemailerSmtpMailSender } from '../mail/mail-sender';
import { MailService } from '../mail/mail.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import { SessionsService } from '../sessions/sessions.service';
import { UsersService } from '../users/users.service';
import { Argon2Gate } from './password/argon2-gate';
import { PasswordHasher } from './password/password-hasher';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/** Cierra la conexión de Redis al apagar la aplicación. */
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

/**
 * Servicios de dominio de autenticación (Fase 2 de HT-AUTH-01). Los controladores HTTP se agregan en la
 * Fase 3. El adaptador real de CAPTCHA está pendiente (DEC-16); la configuración solo admite el de
 * prueba en local.
 */
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) =>
        new Redis(config.redisUrl, {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          commandTimeout: config.rateLimitRedisTimeoutMs,
        }),
    },
    RedisLifecycle,
    {
      provide: RATE_LIMITER,
      inject: [REDIS_CLIENT, AUTH_CONFIG],
      useFactory: (redis: Redis, config: AuthConfig) => new RedisRateLimiter(redis, config.rateLimitRedisTimeoutMs),
    },
    {
      provide: Argon2Gate,
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) =>
        new Argon2Gate({ ...config.argon2, retryAfterS: config.authOverloadRetryAfterS }),
    },
    { provide: PasswordHasher, inject: [Argon2Gate], useFactory: (gate: Argon2Gate) => new PasswordHasher(gate) },
    { provide: CAPTCHA_VERIFIER, useFactory: () => new TestCaptchaVerifier() },
    {
      provide: MAIL_SENDER,
      inject: [AUTH_CONFIG],
      useFactory: (config: AuthConfig) => new NodemailerSmtpMailSender(config.smtp, config.mailFrom),
    },
    UsersService,
    SecurityTokensService,
    SessionsService,
    AuditService,
    LinkBuilder,
    MailDispatcher,
    MailService,
    AuthRateLimitService,
  ],
  exports: [
    UsersService,
    SecurityTokensService,
    SessionsService,
    AuditService,
    MailService,
    PasswordHasher,
    AuthRateLimitService,
    REDIS_CLIENT,
  ],
})
export class AuthCoreModule {}
