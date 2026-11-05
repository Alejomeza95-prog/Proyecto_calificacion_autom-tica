import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { PasswordHasher } from '../auth/password/password-hasher';
import { MailService } from '../mail/mail.service';
import { SecurityTokensService } from '../security-tokens/security-tokens.service';
import { TokenPurpose } from '../security-tokens/token-purpose';
import { AccountStatus } from '../users/account-status';
import { normalizeEmail } from '../users/email-normalizer';
import { UsersService } from '../users/users.service';

/** Resultado de `bootstrap:admin`, sin datos sensibles (la consola solo muestra un texto genérico). */
export type BootstrapOutcome =
  | 'CREADA'
  | 'REEMITIDA'
  | 'RECHAZADA_ADMIN_ACTIVO'
  | 'RECHAZADA_OTRA_CUENTA_INICIAL'
  | 'RECHAZADA_EJECUCION_SIMULTANEA'
  | 'RECHAZADA_CORREO_EN_USO'
  | 'CORREO_NO_ENVIADO';

export interface BootstrapInput {
  readonly nombre: string;
  readonly correo: string;
}

/**
 * Inicialización del primer administrador (plan §5, DEC-08, T-35; CA-13, RN-14, RN-12). Sin endpoint:
 * solo la invoca el comando de consola `bootstrap:admin`.
 * 1) Si existe un ADMIN ACTIVO, se niega sin cambios.
 * 2) Si existe la cuenta BOOTSTRAP pendiente con el mismo correo, emite un enlace nuevo (invalida el
 *    anterior); con otro correo, o si no está pendiente, se niega.
 * 3) Si no existe, la crea sin contraseña utilizable; el índice único parcial `ux_usuarios_bootstrap`
 *    hace que una ejecución simultánea falle con E11000 y se niegue sin crear un segundo documento.
 * 4) Envía el enlace `ACTIVAR_CUENTA` y espera el resultado del envío. El token solo viaja en el correo.
 */
@Injectable()
export class BootstrapAdminService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: SecurityTokensService,
    private readonly hasher: PasswordHasher,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async run(input: BootstrapInput): Promise<BootstrapOutcome> {
    const nombre = input.nombre.trim();
    const correoNormalizado = normalizeEmail(input.correo);

    if (await this.users.hasActiveAdmin()) return this.refuse('RECHAZADA_ADMIN_ACTIVO');

    const existing = await this.users.findBootstrap();
    if (existing) {
      if (existing.estado !== AccountStatus.PENDIENTE_VERIFICACION || existing.correo_normalizado !== correoNormalizado) {
        return this.refuse('RECHAZADA_OTRA_CUENTA_INICIAL', existing._id);
      }
      return this.sendLink(existing._id, existing.nombre, correoNormalizado, 'REEMITIDA');
    }

    // Hash de 256 bits aleatorios que nadie conoce: la cuenta no tiene contraseña utilizable (DEC-08).
    const passwordHash = await this.hasher.hash(randomBytes(32).toString('base64url'));
    const created = await this.users.createBootstrap({ nombre, correoNormalizado, passwordHash });
    if (created === 'BOOTSTRAP_DUPLICADO') return this.refuse('RECHAZADA_EJECUCION_SIMULTANEA');
    if (created === 'CORREO_DUPLICADO') {
      // Con el mismo correo, MongoDB puede informar primero el índice de `correo_normalizado`: si quien lo
      // ocupa es la cuenta BOOTSTRAP, fue otra ejecución simultánea, no una cuenta ajena.
      const winner = await this.users.findBootstrap();
      const concurrent = winner?.correo_normalizado === correoNormalizado;
      return this.refuse(concurrent ? 'RECHAZADA_EJECUCION_SIMULTANEA' : 'RECHAZADA_CORREO_EN_USO');
    }
    return this.sendLink(created, nombre, correoNormalizado, 'CREADA');
  }

  private async sendLink(
    usuarioId: Types.ObjectId,
    nombre: string,
    correo: string,
    outcome: 'CREADA' | 'REEMITIDA',
  ): Promise<BootstrapOutcome> {
    const issued = await this.tokens.issue(usuarioId, TokenPurpose.ACTIVAR_CUENTA);
    await this.audit.recordSafely({ evento: 'ADMIN_INICIALIZADO', resultado: 'OK', usuarioId });
    const sent = await this.mail.deliverActivation({ usuarioId, correo, nombre }, issued.token);
    return sent ? outcome : 'CORREO_NO_ENVIADO';
  }

  private async refuse(outcome: BootstrapOutcome, usuarioId?: Types.ObjectId): Promise<BootstrapOutcome> {
    await this.audit.recordSafely({ evento: 'ADMIN_INICIALIZACION_RECHAZADA', resultado: 'RECHAZADO', ...(usuarioId ? { usuarioId } : {}) });
    return outcome;
  }
}
