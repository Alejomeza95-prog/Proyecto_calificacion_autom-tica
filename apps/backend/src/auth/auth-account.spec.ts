import { Types } from 'mongoose';
import type { AuditService } from '../audit/audit.service';
import { InvalidLinkError, PasswordPolicyError } from '../common/auth-errors';
import type { AuthRateLimitService } from '../common/rate-limit/auth-rate-limit.service';
import type { AuthConfig } from '../config/auth-config';
import { NoInvitationResolver } from '../invitations/invitation-resolver';
import type { MailService } from '../mail/mail.service';
import type { SecurityTokensService } from '../security-tokens/security-tokens.service';
import type { SessionsService } from '../sessions/sessions.service';
import { AccountStatus } from '../users/account-status';
import type { UsersService } from '../users/users.service';
import { AuthAccountService } from './auth-account.service';
import type { PasswordHasher } from './password/password-hasher';

const PASSWORD = 'frase nueva suficientemente larga';

/** Dobles mínimos: solo los métodos que usan `forgotPassword`, `resetPassword` (T-18) y `activateAccount` (T-36). */
function build(user: { estado: AccountStatus } | null, opts: { consumed?: boolean; resetOk?: boolean } = {}) {
  const usuarioId = new Types.ObjectId();
  const doc = user ? { _id: usuarioId, nombre: 'Ana', correo_normalizado: 'ana@example.test', ...user } : null;
  const users = {
    findByEmail: jest.fn().mockResolvedValue(doc),
    findById: jest.fn().mockResolvedValue(doc),
    resetPassword: jest.fn().mockResolvedValue(opts.resetOk ?? true),
    activateBootstrap: jest.fn().mockResolvedValue(opts.resetOk ?? true),
  };
  const tokens = {
    issue: jest.fn().mockResolvedValue({ token: 't'.repeat(43), tokenId: new Types.ObjectId(), expiraEn: new Date() }),
    findExistingId: jest.fn().mockResolvedValue(new Types.ObjectId()),
    consume: jest.fn().mockResolvedValue(opts.consumed === false ? null : { tokenId: new Types.ObjectId(), usuarioId }),
  };
  const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(1) };
  const hasher = { hash: jest.fn().mockResolvedValue('$argon2id$hash') };
  const mail = { sendPasswordReset: jest.fn(), sendPasswordChangedNotice: jest.fn() };
  const rateLimit = {
    guardAccountOperation: jest.fn().mockResolvedValue(undefined),
    guardLinkOperation: jest.fn(async (_op: string, _ip: string, find: () => Promise<unknown>) => find()),
  };
  const audit = { recordSafely: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthAccountService(
    users as unknown as UsersService,
    tokens as unknown as SecurityTokensService,
    sessions as unknown as SessionsService,
    hasher as unknown as PasswordHasher,
    mail as unknown as MailService,
    rateLimit as unknown as AuthRateLimitService,
    audit as unknown as AuditService,
    new NoInvitationResolver(),
    { authMinResponseMs: 0 } as AuthConfig,
  );
  return { service, users, tokens, sessions, hasher, mail, rateLimit, audit, usuarioId };
}

describe('AuthAccountService: recuperación de contraseña (T-18, DEC-19)', () => {
  const eligible = [AccountStatus.ACTIVA, AccountStatus.PENDIENTE_APROBACION];
  const ineligible = [AccountStatus.PENDIENTE_VERIFICACION, AccountStatus.BLOQUEADA, AccountStatus.DESACTIVADA];

  it.each(eligible)('forgot: %s → emite RESTABLECER_PASSWORD y envía el enlace', async (estado) => {
    const t = build({ estado });
    await t.service.forgotPassword(' Ana@Example.test ', '10.0.0.1');
    expect(t.rateLimit.guardAccountOperation).toHaveBeenCalledWith('forgot', '10.0.0.1', 'ana@example.test');
    expect(t.tokens.issue).toHaveBeenCalledWith(t.usuarioId, 'RESTABLECER_PASSWORD');
    expect(t.mail.sendPasswordReset).toHaveBeenCalledTimes(1);
    expect(t.audit.recordSafely).toHaveBeenCalledWith(expect.objectContaining({ evento: 'RECUPERACION_SOLICITADA', resultado: 'OK' }));
  });

  it.each([...ineligible, null])('forgot: %s (o inexistente) → sin token ni correo', async (estado) => {
    const t = build(estado ? { estado } : null);
    await expect(t.service.forgotPassword('ana@example.test', '10.0.0.1')).resolves.toBeUndefined();
    expect(t.tokens.issue).not.toHaveBeenCalled();
    expect(t.mail.sendPasswordReset).not.toHaveBeenCalled();
    expect(t.audit.recordSafely).toHaveBeenCalledWith({ evento: 'RECUPERACION_SOLICITADA', resultado: 'RECHAZADO', ip: '10.0.0.1' });
  });

  it('forgot: un 429 del limitador ocurre antes de buscar la cuenta o emitir', async () => {
    const t = build({ estado: AccountStatus.ACTIVA });
    t.rateLimit.guardAccountOperation.mockRejectedValueOnce(new Error('429'));
    await expect(t.service.forgotPassword('ana@example.test', 'ip')).rejects.toThrow('429');
    expect(t.users.findByEmail).not.toHaveBeenCalled();
    expect(t.tokens.issue).not.toHaveBeenCalled();
  });

  it('reset: contraseña fuera de política → 422 antes del límite y sin consumir el token', async () => {
    const t = build({ estado: AccountStatus.ACTIVA });
    await expect(t.service.resetPassword('tok', 'corta', 'ip')).rejects.toBeInstanceOf(PasswordPolicyError);
    expect(t.rateLimit.guardLinkOperation).not.toHaveBeenCalled();
    expect(t.tokens.consume).not.toHaveBeenCalled();
  });

  it('reset: correcto → hash nuevo, revoca con RESET_PASSWORD, audita y avisa', async () => {
    const t = build({ estado: AccountStatus.PENDIENTE_APROBACION });
    await t.service.resetPassword('tok', PASSWORD, 'ip');
    expect(t.rateLimit.guardLinkOperation).toHaveBeenCalledWith('reset', 'ip', expect.any(Function));
    expect(t.tokens.findExistingId).toHaveBeenCalledWith('tok', 'RESTABLECER_PASSWORD');
    expect(t.users.resetPassword).toHaveBeenCalledWith(t.usuarioId, '$argon2id$hash');
    expect(t.sessions.revokeAllForUser).toHaveBeenCalledWith(t.usuarioId, 'RESET_PASSWORD');
    expect(t.audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'PASSWORD_RESTABLECIDO', resultado: 'OK', usuarioId: t.usuarioId }),
    );
    expect(t.mail.sendPasswordChangedNotice).toHaveBeenCalledTimes(1);
  });

  it('reset: token inválido, vencido o usado → 400 genérico sin hash ni cambios', async () => {
    const t = build({ estado: AccountStatus.ACTIVA }, { consumed: false });
    await expect(t.service.resetPassword('tok', PASSWORD, 'ip')).rejects.toBeInstanceOf(InvalidLinkError);
    expect(t.hasher.hash).not.toHaveBeenCalled();
    expect(t.users.resetPassword).not.toHaveBeenCalled();
    expect(t.sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('reset: la cuenta dejó de ser elegible después del enlace → 400 sin revocar ni avisar', async () => {
    const t = build({ estado: AccountStatus.BLOQUEADA }, { resetOk: false });
    await expect(t.service.resetPassword('tok', PASSWORD, 'ip')).rejects.toBeInstanceOf(InvalidLinkError);
    expect(t.sessions.revokeAllForUser).not.toHaveBeenCalled();
    expect(t.mail.sendPasswordChangedNotice).not.toHaveBeenCalled();
    expect(t.audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'PASSWORD_RESTABLECIDO', resultado: 'RECHAZADO' }),
    );
  });
});

describe('AuthAccountService: activación del primer administrador (T-36, DEC-08)', () => {
  it('correcto → consume ACTIVAR_CUENTA, activa la cuenta BOOTSTRAP y audita CUENTA_ACTIVADA, sin revocar sesiones', async () => {
    const t = build({ estado: AccountStatus.PENDIENTE_VERIFICACION });
    await t.service.activateAccount('tok', PASSWORD, 'ip');
    expect(t.rateLimit.guardLinkOperation).toHaveBeenCalledWith('activate', 'ip', expect.any(Function));
    expect(t.tokens.findExistingId).toHaveBeenCalledWith('tok', 'ACTIVAR_CUENTA');
    expect(t.tokens.consume).toHaveBeenCalledWith('tok', 'ACTIVAR_CUENTA');
    expect(t.users.activateBootstrap).toHaveBeenCalledWith(t.usuarioId, '$argon2id$hash');
    expect(t.sessions.revokeAllForUser).not.toHaveBeenCalled();
    expect(t.audit.recordSafely).toHaveBeenCalledWith(expect.objectContaining({ evento: 'CUENTA_ACTIVADA', resultado: 'OK' }));
  });

  it('contraseña fuera de política → 422 antes del límite y sin consumir', async () => {
    const t = build({ estado: AccountStatus.PENDIENTE_VERIFICACION });
    await expect(t.service.activateAccount('tok', 'corta', 'ip')).rejects.toBeInstanceOf(PasswordPolicyError);
    expect(t.rateLimit.guardLinkOperation).not.toHaveBeenCalled();
    expect(t.tokens.consume).not.toHaveBeenCalled();
  });

  it('token no válido o cuenta que no es BOOTSTRAP pendiente → 400 genérico y CUENTA_ACTIVADA RECHAZADO', async () => {
    const invalid = build(null, { consumed: false });
    await expect(invalid.service.activateAccount('tok', PASSWORD, 'ip')).rejects.toBeInstanceOf(InvalidLinkError);
    expect(invalid.hasher.hash).not.toHaveBeenCalled();
    const notBootstrap = build({ estado: AccountStatus.ACTIVA }, { resetOk: false });
    await expect(notBootstrap.service.activateAccount('tok', PASSWORD, 'ip')).rejects.toBeInstanceOf(InvalidLinkError);
    expect(notBootstrap.audit.recordSafely).toHaveBeenCalledWith(
      expect.objectContaining({ evento: 'CUENTA_ACTIVADA', resultado: 'RECHAZADO' }),
    );
  });
});
