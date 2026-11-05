import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { mongo, type Model, type Types } from 'mongoose';
import { INSTITUTIONAL_ROLES, Role, ROLE_SCOPE, ROLES } from '../authz/role';
import { CLOCK, type Clock } from '../common/clock';
import type { InvitationAssignment } from '../invitations/invitation-resolver';
import { AccountStatus, canTransition, PASSWORD_RECOVERY_ELIGIBLE } from './account-status';
import { normalizeEmail } from './email-normalizer';
import { AccountOrigin, Usuario } from './usuario.schema';

/** Filtro RN-15: rol del catálogo con la institución que exige su alcance (requisito para ACTIVA). */
function coherentRoleFilters(): Record<string, unknown>[] {
  return ROLES.map((rol) =>
    ROLE_SCOPE[rol] === 'GLOBAL' ? { rol, institucion_id: null } : { rol, institucion_id: { $ne: null } },
  );
}

/** E11000 sobre el campo indicado (índice único). */
export function isDuplicateKey(error: unknown, field: string): boolean {
  return (
    error instanceof mongo.MongoServerError &&
    error.code === 11000 &&
    typeof error.keyPattern === 'object' &&
    error.keyPattern !== null &&
    field in error.keyPattern
  );
}

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

  /**
   * Crea una cuenta en PENDIENTE_VERIFICACION (CA-01, plan §5). El rol y la institución solo llegan de
   * una invitación validada en el servidor (`assignment`); sin ella, la cuenta no tiene ninguno (RN-02).
   * Un E11000 sobre `correo_normalizado` devuelve `null`: el llamador responde igual (CA-02, RN-04).
   */
  async register(input: {
    readonly nombre: string;
    readonly correoNormalizado: string;
    readonly passwordHash: string;
    readonly assignment: InvitationAssignment | null;
  }): Promise<Types.ObjectId | null> {
    try {
      const created = await this.usuarios.create({
        nombre: input.nombre,
        correo_normalizado: input.correoNormalizado,
        password_hash: input.passwordHash,
        estado: AccountStatus.PENDIENTE_VERIFICACION,
        rol: input.assignment?.rol ?? null,
        institucion_id: input.assignment?.institucionId ?? null,
        origen: input.assignment ? AccountOrigin.INVITACION : AccountOrigin.AUTORREGISTRO,
        credenciales_actualizadas_en: this.clock.now(),
      });
      return created._id;
    } catch (error) {
      if (isDuplicateKey(error, 'correo_normalizado')) return null;
      throw error;
    }
  }

  /**
   * Verificación del correo (plan §5, DEC-07, DEC-18): PENDIENTE_VERIFICACION → PENDIENTE_APROBACION en el
   * autorregistro; → ACTIVA solo si la cuenta viene de una invitación con rol coherente asignado por el
   * servidor; nunca con un rol global (RN-14: ninguna ruta pública crea un ADMIN ACTIVO). Las cuentas
   * BOOTSTRAP se activan solo con `/auth/activate`. Devuelve el estado nuevo o
   * `null` si la cuenta ya no estaba pendiente de verificación.
   */
  async markEmailVerified(id: Types.ObjectId): Promise<AccountStatus | null> {
    const now = this.clock.now();
    const invited = await this.usuarios
      .updateOne(
        {
          _id: id,
          estado: AccountStatus.PENDIENTE_VERIFICACION,
          origen: AccountOrigin.INVITACION,
          rol: { $in: INSTITUTIONAL_ROLES },
          institucion_id: { $ne: null },
        },
        { $set: { estado: AccountStatus.ACTIVA, correo_verificado_en: now } },
      )
      .exec();
    if (invited.modifiedCount === 1) return AccountStatus.ACTIVA;
    const selfRegistered = await this.usuarios
      .updateOne(
        {
          _id: id,
          estado: AccountStatus.PENDIENTE_VERIFICACION,
          origen: { $in: [AccountOrigin.AUTORREGISTRO, AccountOrigin.INVITACION] },
        },
        { $set: { estado: AccountStatus.PENDIENTE_APROBACION, correo_verificado_en: now } },
      )
      .exec();
    return selfRegistered.modifiedCount === 1 ? AccountStatus.PENDIENTE_APROBACION : null;
  }

  /**
   * Restablecimiento (plan §5, DEC-19, RN-19): solo si la cuenta sigue elegible. Cambia **solo**
   * `password_hash`, `credenciales_actualizadas_en` y `version_credenciales`; nunca estado, rol ni
   * institución. Devuelve `false` si la cuenta dejó de ser elegible.
   */
  async resetPassword(id: Types.ObjectId, passwordHash: string): Promise<boolean> {
    const result = await this.usuarios
      .updateOne(
        { _id: id, estado: { $in: PASSWORD_RECOVERY_ELIGIBLE } },
        { $set: { password_hash: passwordHash, credenciales_actualizadas_en: this.clock.now() }, $inc: { version_credenciales: 1 } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /**
   * Activación del primer administrador (plan §5, CA-13): solo la cuenta BOOTSTRAP pendiente. Define la
   * contraseña, verifica el correo y la deja ACTIVA; el rol ADMIN ya lo asignó el servidor al crearla.
   */
  async activateBootstrap(id: Types.ObjectId, passwordHash: string): Promise<boolean> {
    const now = this.clock.now();
    const result = await this.usuarios
      .updateOne(
        {
          _id: id,
          estado: AccountStatus.PENDIENTE_VERIFICACION,
          origen: AccountOrigin.BOOTSTRAP,
          rol: Role.ADMIN,
          institucion_id: null,
        },
        {
          $set: {
            password_hash: passwordHash,
            correo_verificado_en: now,
            estado: AccountStatus.ACTIVA,
            credenciales_actualizadas_en: now,
          },
          $inc: { version_credenciales: 1 },
        },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  /** Existe algún ADMIN ACTIVO (plan §5, DEC-08: la inicialización se niega). */
  async hasActiveAdmin(): Promise<boolean> {
    return (await this.usuarios.exists({ rol: Role.ADMIN, estado: AccountStatus.ACTIVA }).exec()) !== null;
  }

  /** La cuenta de inicialización, si existe (a lo sumo una: índice único parcial `ux_usuarios_bootstrap`). */
  findBootstrap() {
    return this.usuarios.findOne({ origen: AccountOrigin.BOOTSTRAP }).exec();
  }

  /**
   * Crea la cuenta de inicialización (plan §5, DEC-08, T-35): ADMIN sin institución, PENDIENTE_VERIFICACION
   * y con el hash de un valor aleatorio descartado (sin contraseña utilizable). Un E11000 indica otra
   * cuenta BOOTSTRAP (ejecución simultánea) o un correo ya registrado: no crea nada.
   */
  async createBootstrap(input: {
    readonly nombre: string;
    readonly correoNormalizado: string;
    readonly passwordHash: string;
  }): Promise<Types.ObjectId | 'BOOTSTRAP_DUPLICADO' | 'CORREO_DUPLICADO'> {
    try {
      const created = await this.usuarios.create({
        nombre: input.nombre,
        correo_normalizado: input.correoNormalizado,
        password_hash: input.passwordHash,
        estado: AccountStatus.PENDIENTE_VERIFICACION,
        rol: Role.ADMIN,
        institucion_id: null,
        origen: AccountOrigin.BOOTSTRAP,
        credenciales_actualizadas_en: this.clock.now(),
      });
      return created._id;
    } catch (error) {
      if (isDuplicateKey(error, 'correo_normalizado')) return 'CORREO_DUPLICADO';
      if (isDuplicateKey(error, 'origen')) return 'BOOTSTRAP_DUPLICADO';
      throw error;
    }
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
    if (to === AccountStatus.ACTIVA) filter.$or = coherentRoleFilters();
    const update: Record<string, unknown> = { $set: { estado: to, actualizado_en: this.clock.now() } };
    if (from === AccountStatus.ACTIVA) update.$inc = { version_credenciales: 1 };

    const result = await this.usuarios.updateOne(filter, update).exec();
    return result.modifiedCount === 1;
  }
}
