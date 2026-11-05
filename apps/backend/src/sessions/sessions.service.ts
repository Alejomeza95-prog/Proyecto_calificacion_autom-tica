import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { CLOCK, type Clock } from '../common/clock';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { sha256Hex, TOKEN_BYTES } from '../security-tokens/security-tokens.service';
import { AccountStatus } from '../users/account-status';
import { Usuario } from '../users/usuario.schema';
import { RevocationReason, Sesion } from './sesion.schema';

export interface CreatedSession {
  readonly sid: Types.ObjectId;
  /** Token de renovación crudo: solo viaja en la cookie `HttpOnly` (DEC-01). */
  readonly refreshToken: string;
  readonly expiraEn: Date;
  readonly versionCredenciales: number;
}

export type RotationFailure =
  | 'NO_ENCONTRADA'
  | 'REUTILIZACION'
  | 'CUENTA_NO_ACTIVA'
  | 'CREDENCIALES_CAMBIADAS'
  | 'LIMITE_ROTACIONES'
  | 'CONCURRENTE';

export type RotationResult =
  | {
      readonly ok: true;
      readonly sid: Types.ObjectId;
      readonly usuarioId: Types.ObjectId;
      readonly refreshToken: string;
      readonly versionCredenciales: number;
      readonly expiraEn: Date;
    }
  | { readonly ok: false; readonly reason: RotationFailure };

export interface ValidSession {
  readonly sid: Types.ObjectId;
  readonly usuarioId: Types.ObjectId;
  readonly versionCredenciales: number;
}

/**
 * Sesiones revocables (plan §3.3 y §5, DEC-01, DEC-10, T-09).
 * - La sesión es la familia de tokens de renovación: reutilizar cualquiera ya rotado revoca la sesión.
 * - Rotación en una sola operación atómica, con el tope `SESSION_MAX_ROTATIONS` en el filtro.
 * - Nunca elimina hashes anteriores ni guarda tokens originales (solo SHA-256).
 * - La rotación no extiende `expira_en` (duración absoluta desde el login).
 */
@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Sesion.name) private readonly sesiones: Model<Sesion>,
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    private readonly audit: AuditService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private newRefreshToken(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }

  /** Crea la sesión copiando `version_credenciales` de la cuenta (DEC-10). */
  async create(usuarioId: Types.ObjectId, versionCredenciales: number): Promise<CreatedSession> {
    const refreshToken = this.newRefreshToken();
    const expiraEn = new Date(this.clock.now().getTime() + this.config.ttl.sessionRefreshMs);
    const created = await this.sesiones.create({
      usuario_id: usuarioId,
      refresh_hash: sha256Hex(refreshToken),
      refresh_hashes_previos: [],
      version_credenciales: versionCredenciales,
      expira_en: expiraEn,
    });
    return { sid: created._id, refreshToken, expiraEn, versionCredenciales };
  }

  /** Sesión vigente (no revocada ni vencida) con la versión de credenciales indicada (claim `cv`). */
  async findValid(sid: Types.ObjectId | string, cv: number): Promise<ValidSession | null> {
    const found = await this.sesiones
      .findOne(
        { _id: sid, revocada_en: null, expira_en: { $gt: this.clock.now() }, version_credenciales: cv },
        { _id: 1, usuario_id: 1, version_credenciales: 1 },
      )
      .lean()
      .exec();
    return found ? { sid: found._id, usuarioId: found.usuario_id, versionCredenciales: found.version_credenciales } : null;
  }

  /** Rotación del token de renovación (plan §5, «Renovación»). */
  async rotate(refreshToken: string): Promise<RotationResult> {
    const now = this.clock.now();
    const h = sha256Hex(refreshToken);

    // 1) Sesión vigente por el hash actual.
    const current = await this.sesiones
      .findOne({ refresh_hash: h, revocada_en: null, expira_en: { $gt: now } }, { _id: 1, usuario_id: 1, version_credenciales: 1 })
      .lean()
      .exec();
    if (!current) {
      // Reutilización de cualquier token ya rotado de la familia → revocar la sesión completa.
      const reused = await this.sesiones.findOne({ refresh_hashes_previos: h }, { _id: 1, usuario_id: 1 }).lean().exec();
      if (!reused) return { ok: false, reason: 'NO_ENCONTRADA' };
      await this.revoke(reused._id, RevocationReason.REUTILIZACION);
      await this.audit.recordSafely({ evento: 'REUTILIZACION_DETECTADA', resultado: 'RECHAZADO', usuarioId: reused.usuario_id });
      return { ok: false, reason: 'REUTILIZACION' };
    }

    // 2) La cuenta debe seguir ACTIVA y con la misma versión de credenciales (DEC-10, RN-16).
    const usuario = await this.usuarios
      .findById(current.usuario_id, { estado: 1, version_credenciales: 1 })
      .lean()
      .exec();
    if (!usuario || usuario.estado !== AccountStatus.ACTIVA) {
      await this.revoke(current._id, RevocationReason.CUENTA_NO_ACTIVA);
      return { ok: false, reason: 'CUENTA_NO_ACTIVA' };
    }
    if (usuario.version_credenciales !== current.version_credenciales) {
      await this.revoke(current._id, RevocationReason.RESET_PASSWORD);
      return { ok: false, reason: 'CREDENCIALES_CAMBIADAS' };
    }

    // 3) Rotación atómica con el tope de rotaciones comprobado en el filtro.
    const nuevo = this.newRefreshToken();
    const rotated = await this.sesiones
      .findOneAndUpdate(
        {
          _id: current._id,
          refresh_hash: h,
          revocada_en: null,
          version_credenciales: current.version_credenciales,
          expira_en: { $gt: now },
          [`refresh_hashes_previos.${this.config.sessionMaxRotations - 1}`]: { $exists: false },
        },
        { $set: { refresh_hash: sha256Hex(nuevo) }, $push: { refresh_hashes_previos: h } },
        { projection: { _id: 1, expira_en: 1 }, returnDocument: 'after' },
      )
      .lean()
      .exec();
    if (rotated) {
      return {
        ok: true,
        sid: rotated._id,
        usuarioId: current.usuario_id,
        refreshToken: nuevo,
        versionCredenciales: current.version_credenciales,
        expiraEn: rotated.expira_en,
      };
    }

    // 4) No coincidió: límite de rotaciones alcanzado o rotación concurrente del mismo token.
    const atLimit = await this.sesiones
      .exists({
        _id: current._id,
        revocada_en: null,
        [`refresh_hashes_previos.${this.config.sessionMaxRotations - 1}`]: { $exists: true },
      })
      .exec();
    if (atLimit) {
      await this.revoke(current._id, RevocationReason.LIMITE_ROTACIONES);
      return { ok: false, reason: 'LIMITE_ROTACIONES' };
    }
    return { ok: false, reason: 'CONCURRENTE' };
  }

  /** Revoca una sesión vigente. Devuelve `true` si estaba vigente. */
  async revoke(sid: Types.ObjectId | string, motivo: RevocationReason): Promise<boolean> {
    const result = await this.sesiones
      .updateOne({ _id: sid, revocada_en: null }, { $set: { revocada_en: this.clock.now(), motivo_revocacion: motivo } })
      .exec();
    return result.modifiedCount === 1;
  }

  /** Revoca todas las sesiones vigentes de la cuenta (restablecimiento, RN-08). Devuelve cuántas. */
  async revokeAllForUser(usuarioId: Types.ObjectId, motivo: RevocationReason): Promise<number> {
    const result = await this.sesiones
      .updateMany({ usuario_id: usuarioId, revocada_en: null }, { $set: { revocada_en: this.clock.now(), motivo_revocacion: motivo } })
      .exec();
    return result.modifiedCount;
  }
}
