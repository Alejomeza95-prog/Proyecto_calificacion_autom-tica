import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { ROLE_SCOPE, ROLES } from '../authz/role';
import { CLOCK, type Clock } from '../common/clock';
import { AccountStatus, canTransition } from './account-status';
import { normalizeEmail } from './email-normalizer';
import { Usuario } from './usuario.schema';

export class InvalidTransitionError extends Error {
  constructor(from: AccountStatus, to: AccountStatus) {
    super(`Transición de estado no permitida: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Estados de cuenta y búsquedas por correo normalizado (plan §2.3, T-06).
 * Nunca escribe `rol` ni `institucion_id` desde un DTO público (RN-02).
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  findByEmail(rawEmail: string) {
    return this.usuarios.findOne({ correo_normalizado: normalizeEmail(rawEmail) }).exec();
  }

  findByEmailWithPassword(rawEmail: string) {
    return this.usuarios.findOne({ correo_normalizado: normalizeEmail(rawEmail) }).select('+password_hash').exec();
  }

  findById(id: Types.ObjectId | string) {
    return this.usuarios.findById(id).exec();
  }

  /** Registra el último inicio de sesión correcto. No toca estado, rol ni credenciales. */
  async touchLastAccess(id: Types.ObjectId): Promise<void> {
    await this.usuarios.updateOne({ _id: id }, { $set: { ultimo_acceso_en: this.clock.now() } }).exec();
  }

  /**
   * Cambia el estado de forma atómica si la cuenta sigue en `from`.
   * - Rechaza transiciones no permitidas (RN-01).
   * - Pasar a ACTIVA exige un rol del catálogo y una institución coherente con su alcance (RN-15),
   *   comprobado en el propio filtro de la actualización.
   * - Salir de ACTIVA incrementa `version_credenciales` en la misma actualización (DEC-10, RN-16).
   * Devuelve `true` si se aplicó.
   */
  async changeStatus(id: Types.ObjectId | string, from: AccountStatus, to: AccountStatus): Promise<boolean> {
    if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);

    const filter: Record<string, unknown> = { _id: id, estado: from };
    if (to === AccountStatus.ACTIVA) {
      filter.$or = ROLES.map((rol) =>
        ROLE_SCOPE[rol] === 'GLOBAL' ? { rol, institucion_id: null } : { rol, institucion_id: { $ne: null } },
      );
    }
    const update: Record<string, unknown> = { $set: { estado: to, actualizado_en: this.clock.now() } };
    if (from === AccountStatus.ACTIVA) update.$inc = { version_credenciales: 1 };

    const result = await this.usuarios.updateOne(filter, update).exec();
    return result.modifiedCount === 1;
  }
}
