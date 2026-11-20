import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminEvent, RecursoTipo } from '../audit/admin-event';
import type { Principal } from '../authz/principal';
import { roleInstitutionViolation, Role } from '../authz/role';
import { conflict, invalidField, notFound } from '../common/http/object-id';
import { ProblemException, ProblemType } from '../common/http/problem';
import { pageWindow, type Page, type PaginationQuery } from '../common/pagination';
import { Institucion } from '../instituciones/institucion.schema';
import { AccountStatus } from '../users/account-status';
import { Usuario } from '../users/usuario.schema';

/** Roles que una aprobación puede asignar: solo institucionales, nunca ADMIN (RN-03). */
export const APPROVABLE_ROLES = [Role.COORDINADOR, Role.DOCENTE] as const;
export type ApprovableRole = (typeof APPROVABLE_ROLES)[number];

export interface PendingAccount {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly registradoEn: string;
}

export interface ApprovedAccount {
  readonly id: string;
  readonly estado: AccountStatus;
  readonly rol: ApprovableRole;
  readonly institucionId: string;
}

/**
 * Panel de usuarios (HT-AUTH-03 plan §2.3): listado de pendientes y aprobación PENDIENTE_APROBACION →
 * ACTIVA (RN-01..RN-04). La aprobación es una única escritura atómica condicionada al estado (DEC-01).
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @InjectModel(Institucion.name) private readonly instituciones: Model<Institucion>,
    private readonly audit: AdminAuditService,
  ) {}

  /** CA-01: solo PENDIENTE_APROBACION, más antiguas primero; nunca credenciales. */
  async listPending(query: PaginationQuery): Promise<Page<PendingAccount>> {
    const { pagina, limite, skip } = pageWindow(query);
    const filter = { estado: AccountStatus.PENDIENTE_APROBACION };
    const [docs, total] = await Promise.all([
      this.usuarios
        .find(filter, { nombre: 1, correo_normalizado: 1, creado_en: 1 })
        .sort({ creado_en: 1, _id: 1 })
        .skip(skip)
        .limit(limite)
        .lean()
        .exec(),
      this.usuarios.countDocuments(filter).exec(),
    ]);
    return {
      items: docs.map((d) => ({
        id: d._id.toHexString(),
        nombre: d.nombre,
        correo: d.correo_normalizado,
        registradoEn: d.creado_en.toISOString(),
      })),
      total,
      pagina,
      limite,
    };
  }

  /** CA-02, CA-03, RN-02..RN-04. */
  async approve(
    principal: Principal,
    usuarioId: Types.ObjectId,
    input: { readonly rol: ApprovableRole; readonly institucionId: Types.ObjectId },
  ): Promise<ApprovedAccount> {
    // DEC-11: nadie aprueba ni asigna rol a su propia cuenta (defensa en profundidad).
    if (principal.id.equals(usuarioId)) throw new ProblemException(403, ProblemType.ACCESO_DENEGADO);
    if (!(APPROVABLE_ROLES as readonly string[]).includes(input.rol)) throw invalidField('rol', 'isIn');

    const institucion = await this.instituciones.exists({ _id: input.institucionId, activa: true }).exec();
    if (!institucion) throw invalidField('institucionId', 'institucionVigente');

    // HT-AUTH-01 RN-15: el validador `pre('validate')` no corre en `findOneAndUpdate`.
    if (roleInstitutionViolation(AccountStatus.ACTIVA, input.rol, input.institucionId)) {
      throw invalidField('rol', 'coherenciaRolInstitucion');
    }

    const updated = await this.usuarios
      .findOneAndUpdate(
        { _id: usuarioId, estado: AccountStatus.PENDIENTE_APROBACION },
        { $set: { estado: AccountStatus.ACTIVA, rol: input.rol, institucion_id: input.institucionId } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updated) {
      // RN-04: otra aprobación ganó, o la cuenta no estaba pendiente → 409; inexistente → 404.
      if (await this.usuarios.exists({ _id: usuarioId }).exec()) throw conflict();
      throw notFound();
    }

    await this.audit.record({
      evento: AdminEvent.CUENTA_APROBADA,
      actorId: principal.id,
      recursoTipo: RecursoTipo.USUARIO,
      recursoId: usuarioId,
      institucionId: input.institucionId,
      detalle: { estado_anterior: AccountStatus.PENDIENTE_APROBACION, estado_nuevo: AccountStatus.ACTIVA, rol: input.rol },
    });

    return {
      id: usuarioId.toHexString(),
      estado: AccountStatus.ACTIVA,
      rol: input.rol,
      institucionId: input.institucionId.toHexString(),
    };
  }
}
