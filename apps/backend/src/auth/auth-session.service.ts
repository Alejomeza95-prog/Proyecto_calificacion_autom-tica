import { Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AccessTokenService, type IssuedAccessToken } from '../authz/access-token.service';
import type { Principal } from '../authz/principal';
import { InvalidCredentialsError } from '../common/auth-errors';
import { AuthRateLimitService } from '../common/rate-limit/auth-rate-limit.service';
import { RevocationReason } from '../sessions/sesion.schema';
import { SessionsService } from '../sessions/sessions.service';
import { AccountStatus } from '../users/account-status';
import { normalizeEmail } from '../users/email-normalizer';
import { UsersService } from '../users/users.service';
import { PasswordHasher } from './password/password-hasher';

/** Resultado de login y renovación: el token de renovación solo viaja en la cookie (DEC-01). */
export interface SessionGrant extends IssuedAccessToken {
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

export interface LoginInput {
  readonly correo: string;
  readonly password: string;
  readonly captchaToken?: string;
}

/**
 * Inicio de sesión, renovación y cierre (T-17; plan §5 y §11; DEC-01, DEC-10, DEC-16).
 * - El login sigue el orden de `AuthRateLimitService.guardLogin` (límites → global → desafío →
 *   Argon2id); el 401 es idéntico para correo inexistente, contraseña errónea y cuenta no ACTIVA.
 * - `/refresh` rota de forma atómica (`SessionsService.rotate`) y no emite JWT si la sesión no es
 *   válida, la cuenta no está ACTIVA o cambió la versión de credenciales.
 */
@Injectable()
export class AuthSessionService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly hasher: PasswordHasher,
    private readonly rateLimit: AuthRateLimitService,
    private readonly tokens: AccessTokenService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, ip: string): Promise<SessionGrant> {
    const correoNormalizado = normalizeEmail(input.correo);
    // Resultado de la verificación (se completa dentro de `checkCredentials`).
    const found: { account?: { readonly id: Types.ObjectId; readonly cv: number }; userId?: Types.ObjectId } = {};

    try {
      await this.rateLimit.guardLogin(
        { ip, correoNormalizado, ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}) },
        async () => {
          const user = await this.users.findByEmailWithPassword(correoNormalizado);
          if (!user) return this.hasher.verifyDummy(input.password);
          found.userId = user._id;
          // La contraseña se verifica siempre, también si la cuenta no está ACTIVA (tiempo equilibrado).
          const ok = await this.hasher.verify(user.password_hash, input.password);
          if (!ok || user.estado !== AccountStatus.ACTIVA) return false;
          found.account = { id: user._id, cv: user.version_credenciales };
          return true;
        },
      );
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        await this.audit.recordSafely({ evento: 'LOGIN_FALLIDO', resultado: 'RECHAZADO', usuarioId: found.userId ?? null, ip });
      }
      throw error;
    }
    const account = found.account;
    if (!account) throw new InvalidCredentialsError();

    const session = await this.sessions.create(account.id, account.cv);
    await this.users.touchLastAccess(account.id);
    await this.audit.recordSafely({ evento: 'LOGIN_OK', resultado: 'OK', usuarioId: account.id, ip });
    return {
      ...this.tokens.issue(account.id, session.sid, session.versionCredenciales),
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiraEn,
    };
  }

  /** Devuelve la nueva concesión o `null` (401 genérico, sin JWT nuevo). */
  async refresh(refreshToken: string | undefined, ip: string): Promise<SessionGrant | null> {
    if (!refreshToken) {
      await this.audit.recordSafely({ evento: 'RENOVACION_RECHAZADA', resultado: 'RECHAZADO', ip });
      return null;
    }
    const result = await this.sessions.rotate(refreshToken);
    if (!result.ok) {
      // REUTILIZACION_DETECTADA ya la audita `SessionsService.rotate`.
      if (result.reason !== 'REUTILIZACION') {
        await this.audit.recordSafely({ evento: 'RENOVACION_RECHAZADA', resultado: 'RECHAZADO', ip });
      }
      return null;
    }
    await this.audit.recordSafely({ evento: 'SESION_RENOVADA', resultado: 'OK', usuarioId: result.usuarioId, ip });
    return {
      ...this.tokens.issue(result.usuarioId, result.sid, result.versionCredenciales),
      refreshToken: result.refreshToken,
      refreshExpiresAt: result.expiraEn,
    };
  }

  /** Revoca la sesión del JWT presentado (CA-12). */
  async logout(principal: Principal, ip: string): Promise<void> {
    await this.sessions.revoke(principal.sid, RevocationReason.LOGOUT);
    await this.audit.recordSafely({ evento: 'LOGOUT', resultado: 'OK', usuarioId: principal.id, ip });
  }
}
