import { Inject, Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { ROLE_SCOPE, roleInstitutionViolation } from '../authz/role';
import { InvalidLinkError, PasswordPolicyError } from '../common/auth-errors';
import { withMinimumDuration } from '../common/min-duration';
import { AuthRateLimitService } from '../common/rate-limit/auth-rate-limit.service';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { INVITATION_RESOLVER, type InvitationAssignment, type InvitationResolver } from '../invitations/invitation-resolver';
import { MailService } from '../mail/mail.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import { TokenPurpose } from '../security-tokens/token-purpose';
import { RevocationReason } from '../sessions/sesion.schema';
import { SessionsService } from '../sessions/sessions.service';
import { AccountStatus, PASSWORD_RECOVERY_ELIGIBLE } from '../users/account-status';
import { normalizeEmail } from '../users/email-normalizer';
import { AccountOrigin } from '../users/usuario.schema';
import { UsersService } from '../users/users.service';
import { checkPasswordPolicy } from './password/password-policy';
import { PasswordHasher } from './password/password-hasher';

export interface RegisterInput {
  readonly nombre: string;
  readonly correo: string;
  readonly password: string;
  readonly invitacion?: string;
}

/** Rechaza la contraseña fuera de política (422) antes de cualquier efecto (CA-03). */
export function assertPasswordPolicy(password: string): void {
  const policy = checkPasswordPolicy(password);
  if (!policy.ok) throw new PasswordPolicyError(policy.reason);
}

/**
 * Operaciones públicas de cuenta (plan §5, §8 y §9.2): registro (T-15), verificación y reenvío (T-16),
 * recuperación y restablecimiento de contraseña (T-18) y activación del primer administrador (T-36).
 * - Respuesta idéntica y tiempo mínimo `AUTH_MIN_RESPONSE_MS` exista o no la cuenta (RN-04).
 * - Límite por correo normalizado e IP antes de Argon2id (DEC-15).
 * - El token crudo solo viaja en el correo (RN-06, DEC-09).
 */
@Injectable()
export class AuthAccountService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: SecurityTokensService,
    private readonly sessions: SessionsService,
    private readonly hasher: PasswordHasher,
    private readonly mail: MailService,
    private readonly rateLimit: AuthRateLimitService,
    private readonly audit: AuditService,
    @Inject(INVITATION_RESOLVER) private readonly invitations: InvitationResolver,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /**
   * Registro (CA-01, CA-02, CA-03, CA-05; plan §5): crea la cuenta en PENDIENTE_VERIFICACION y envía el
   * enlace de verificación. El hash Argon2id se calcula siempre antes de insertar, de modo que un correo
   * ya registrado (E11000) cuesta lo mismo que uno nuevo; en ese caso no se envía nada (RN-04).
   * El rol y la institución solo salen de una invitación validada en el servidor (RN-02, RN-18).
   */
  async register(input: RegisterInput, ip: string): Promise<void> {
    assertPasswordPolicy(input.password);
    const correoNormalizado = normalizeEmail(input.correo);
    await withMinimumDuration(this.config.authMinResponseMs, async () => {
      await this.rateLimit.guardAccountOperation('register', ip, correoNormalizado);
      const assignment = input.invitacion ? await this.findInvitation(input.invitacion, correoNormalizado) : null;
      const passwordHash = await this.hasher.hash(input.password);
      const nombre = input.nombre.trim();
      const usuarioId = await this.users.register({ nombre, correoNormalizado, passwordHash, assignment });
      if (!usuarioId) {
        await this.audit.recordSafely({ evento: 'REGISTRO', resultado: 'RECHAZADO', ip });
        return;
      }
      if (assignment && input.invitacion) await this.invitations.markUsed(input.invitacion, usuarioId);
      const issued = await this.tokens.issue(usuarioId, TokenPurpose.VERIFICAR_CORREO);
      this.mail.sendVerification({ usuarioId, correo: correoNormalizado, nombre }, issued.token);
      await this.audit.recordSafely({ evento: 'REGISTRO', resultado: 'OK', usuarioId, ip });
    });
  }

  /**
   * Verificación del correo (T-16; CA-04, CA-05, CA-10; plan §5, DEC-18): solo por `POST`, con el token
   * del enlace. Límite por IP y por registro existente (plan §5), consumo atómico de un solo uso y
   * transición PENDIENTE_VERIFICACION → PENDIENTE_APROBACION (o ACTIVA solo por invitación). Cualquier
   * token inválido, vencido, usado o invalidado → 400 genérico, sin distinguir la causa.
   */
  async verifyEmail(token: string, ip: string): Promise<AccountStatus> {
    await this.rateLimit.guardLinkOperation('verify', ip, () =>
      this.tokens.findExistingId(token, TokenPurpose.VERIFICAR_CORREO),
    );
    const consumed = await this.tokens.consume(token, TokenPurpose.VERIFICAR_CORREO);
    const estado = consumed ? await this.users.markEmailVerified(consumed.usuarioId) : null;
    if (!consumed || !estado) {
      await this.audit.recordSafely({ evento: 'VERIFICACION', resultado: 'RECHAZADO', ip });
      throw new InvalidLinkError();
    }
    await this.audit.recordSafely({ evento: 'VERIFICACION', resultado: 'OK', usuarioId: consumed.usuarioId, ip });
    return estado;
  }

  /**
   * Reenvío de la verificación (T-16; CA-06, RN-04, RN-06; plan §9.2): respuesta idéntica y tiempo
   * mínimo exista o no la cuenta. Solo una cuenta en PENDIENTE_VERIFICACION que no sea BOOTSTRAP
   * (el primer administrador se activa con `bootstrap:admin` y `/auth/activate`) recibe un token
   * nuevo, que invalida el anterior. Un 429 ocurre antes de emitir token o enviar correo.
   */
  async resendVerification(correo: string, ip: string): Promise<void> {
    const correoNormalizado = normalizeEmail(correo);
    await withMinimumDuration(this.config.authMinResponseMs, async () => {
      await this.rateLimit.guardAccountOperation('resend', ip, correoNormalizado);
      const user = await this.users.findByEmail(correoNormalizado);
      if (!user || user.estado !== AccountStatus.PENDIENTE_VERIFICACION || user.origen === AccountOrigin.BOOTSTRAP) {
        await this.audit.recordSafely({ evento: 'REENVIO', resultado: 'RECHAZADO', ip });
        return;
      }
      const issued = await this.tokens.issue(user._id, TokenPurpose.VERIFICAR_CORREO);
      this.mail.sendVerification({ usuarioId: user._id, correo: correoNormalizado, nombre: user.nombre }, issued.token, true);
      await this.audit.recordSafely({ evento: 'REENVIO', resultado: 'OK', usuarioId: user._id, ip });
    });
  }

  /**
   * Solicitud de recuperación (T-18; CA-08, RN-04, RN-19; plan §5, DEC-19): respuesta idéntica y tiempo
   * mínimo para cualquier correo. Solo una cuenta ACTIVA o PENDIENTE_APROBACION recibe un token
   * `RESTABLECER_PASSWORD` (invalida el anterior) y el correo; en los demás casos no se emite ni se envía
   * nada. Un 429 ocurre antes de cualquier efecto.
   */
  async forgotPassword(correo: string, ip: string): Promise<void> {
    const correoNormalizado = normalizeEmail(correo);
    await withMinimumDuration(this.config.authMinResponseMs, async () => {
      await this.rateLimit.guardAccountOperation('forgot', ip, correoNormalizado);
      const user = await this.users.findByEmail(correoNormalizado);
      if (!user || !PASSWORD_RECOVERY_ELIGIBLE.includes(user.estado)) {
        await this.audit.recordSafely({ evento: 'RECUPERACION_SOLICITADA', resultado: 'RECHAZADO', ip });
        return;
      }
      const issued = await this.tokens.issue(user._id, TokenPurpose.RESTABLECER_PASSWORD);
      this.mail.sendPasswordReset({ usuarioId: user._id, correo: correoNormalizado, nombre: user.nombre }, issued.token);
      await this.audit.recordSafely({ evento: 'RECUPERACION_SOLICITADA', resultado: 'OK', usuarioId: user._id, ip });
    });
  }

  /**
   * Restablecimiento (T-18; CA-09, CA-10, RN-08, RN-16, RN-19; plan §5, DEC-19):
   * 1) política de la contraseña (422 sin efectos); 2) límite por IP y por registro existente;
   * 3) consumo atómico del token; 4) actualización **solo** del hash si la cuenta sigue elegible (si no,
   * 400 genérico, sin revocar ni avisar); 5) revocación de todas las sesiones (`RESET_PASSWORD`);
   * 6) auditoría `PASSWORD_RESTABLECIDO` y aviso por correo. Si un paso posterior al consumo falla, el
   * token ya está consumido y la persona pide otro (plan §5); `version_credenciales` ya invalida las
   * sesiones aunque falle la revocación (DEC-10).
   */
  async resetPassword(token: string, password: string, ip: string): Promise<void> {
    assertPasswordPolicy(password);
    await this.rateLimit.guardLinkOperation('reset', ip, () =>
      this.tokens.findExistingId(token, TokenPurpose.RESTABLECER_PASSWORD),
    );
    const consumed = await this.tokens.consume(token, TokenPurpose.RESTABLECER_PASSWORD);
    if (!consumed) return this.rejectLink('PASSWORD_RESTABLECIDO', ip);
    const passwordHash = await this.hasher.hash(password);
    if (!(await this.users.resetPassword(consumed.usuarioId, passwordHash))) return this.rejectLink('PASSWORD_RESTABLECIDO', ip, consumed.usuarioId);
    await this.sessions.revokeAllForUser(consumed.usuarioId, RevocationReason.RESET_PASSWORD);
    await this.audit.recordSafely({ evento: 'PASSWORD_RESTABLECIDO', resultado: 'OK', usuarioId: consumed.usuarioId, ip });
    const user = await this.users.findById(consumed.usuarioId);
    if (user) this.mail.sendPasswordChangedNotice({ usuarioId: user._id, correo: user.correo_normalizado, nombre: user.nombre });
  }

  /**
   * Activación del primer administrador (T-36; CA-13, CA-03, RN-06, RN-14; plan §5, DEC-08): política
   * (422 sin efectos) → límite por IP y por registro existente → consumo atómico de `ACTIVAR_CUENTA` →
   * `UsersService.activateBootstrap` (solo la cuenta BOOTSTRAP pendiente: contraseña, correo verificado,
   * ACTIVA y `version_credenciales` +1). No inicia sesión. Cualquier otro caso → 400 genérico.
   */
  async activateAccount(token: string, password: string, ip: string): Promise<void> {
    assertPasswordPolicy(password);
    await this.rateLimit.guardLinkOperation('activate', ip, () =>
      this.tokens.findExistingId(token, TokenPurpose.ACTIVAR_CUENTA),
    );
    const consumed = await this.tokens.consume(token, TokenPurpose.ACTIVAR_CUENTA);
    if (!consumed) return this.rejectLink('CUENTA_ACTIVADA', ip);
    const passwordHash = await this.hasher.hash(password);
    if (!(await this.users.activateBootstrap(consumed.usuarioId, passwordHash))) {
      return this.rejectLink('CUENTA_ACTIVADA', ip, consumed.usuarioId);
    }
    await this.audit.recordSafely({ evento: 'CUENTA_ACTIVADA', resultado: 'OK', usuarioId: consumed.usuarioId, ip });
  }

  private async rejectLink(
    evento: 'PASSWORD_RESTABLECIDO' | 'CUENTA_ACTIVADA',
    ip: string,
    usuarioId?: Types.ObjectId,
  ): Promise<never> {
    await this.audit.recordSafely({ evento, resultado: 'RECHAZADO', ip, ...(usuarioId ? { usuarioId } : {}) });
    throw new InvalidLinkError();
  }

  /**
   * Solo acepta asignaciones **institucionales** y coherentes con el catálogo (RN-15); si no, el registro
   * es un autorregistro. Un rol global (ADMIN) nunca sale de una ruta pública (RN-14, RN-18): los
   * administradores solo los crea `bootstrap:admin` o un administrador existente.
   */
  private async findInvitation(code: string, correoNormalizado: string): Promise<InvitationAssignment | null> {
    const assignment = await this.invitations.find(code, correoNormalizado);
    if (!assignment || ROLE_SCOPE[assignment.rol] !== 'INSTITUCIONAL') return null;
    return roleInstitutionViolation('ACTIVA', assignment.rol, assignment.institucionId) ? null : assignment;
  }
}
