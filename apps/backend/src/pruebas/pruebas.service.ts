import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminEvent, RecursoTipo } from '../audit/admin-event';
import { InstitutionScopePolicy } from '../authz/institution-scope.policy';
import type { Principal } from '../authz/principal';
import { ROLE_SCOPE } from '../authz/role';
import { conflict, invalidField, notFound } from '../common/http/object-id';
import { Institucion } from '../instituciones/institucion.schema';
import { isDuplicateKey } from '../users/users.service';
import { Prueba } from './prueba.schema';

export interface PruebaDto {
  readonly id: string;
  readonly nombre: string;
  readonly institucionId: string;
}

function toDto(d: { _id: Types.ObjectId; nombre: string; institucion_id: Types.ObjectId }): PruebaDto {
  return { id: d._id.toHexString(), nombre: d.nombre, institucionId: d.institucion_id.toHexString() };
}

/** Catálogo mínimo de pruebas por institución (HT-AUTH-03 plan §3.3, DEC-04; RN-13). */
@Injectable()
export class PruebasService {
  constructor(
    @InjectModel(Prueba.name) private readonly pruebas: Model<Prueba>,
    @InjectModel(Institucion.name) private readonly instituciones: Model<Institucion>,
    private readonly scope: InstitutionScopePolicy,
    private readonly audit: AdminAuditService,
  ) {}

  /** Pruebas dentro del alcance; el ADMIN puede filtrar por institución. */
  async list(principal: Principal, institucionId?: Types.ObjectId): Promise<PruebaDto[]> {
    const filter = this.scope.scoped(principal, institucionId ? { institucion_id: institucionId } : {});
    const docs = await this.pruebas
      .find(filter, { nombre: 1, institucion_id: 1 })
      .collation({ locale: 'es', strength: 2 })
      .sort({ nombre: 1 })
      .lean()
      .exec();
    return docs.map(toDto);
  }

  /** Prueba dentro del alcance o 404 (RN-13). */
  async findInScope(principal: Principal, id: Types.ObjectId): Promise<PruebaDto> {
    const doc = await this.pruebas.findOne(this.scope.scoped(principal, { _id: id }), { nombre: 1, institucion_id: 1 }).lean().exec();
    if (!doc) throw notFound();
    return toDto(doc);
  }

  /**
   * Alta mínima (DEC-04, DEC-06). Un rol institucional crea solo en su institución (otra → 404); el ADMIN
   * indica la institución, que debe existir y estar activa. Nombre repetido en la institución → 409.
   */
  async create(principal: Principal, input: { nombre: string; institucionId?: Types.ObjectId }): Promise<PruebaDto> {
    const institucionId = this.targetInstitution(principal, input.institucionId);
    if (!(await this.instituciones.exists({ _id: institucionId, activa: true }).exec())) {
      throw invalidField('institucionId', 'institucionVigente');
    }
    try {
      const created = await this.pruebas.create({ nombre: input.nombre, institucion_id: institucionId, creado_por: principal.id });
      await this.audit.record({
        evento: AdminEvent.PRUEBA_CREADA,
        actorId: principal.id,
        recursoTipo: RecursoTipo.PRUEBA,
        recursoId: created._id,
        institucionId,
      });
      return toDto(created);
    } catch (error) {
      if (isDuplicateKey(error, 'nombre')) throw conflict();
      throw error;
    }
  }

  private targetInstitution(principal: Principal, requested?: Types.ObjectId): Types.ObjectId {
    if (principal.rol !== null && ROLE_SCOPE[principal.rol] === 'GLOBAL') {
      if (!requested) throw invalidField('institucionId', 'isDefined');
      return requested;
    }
    const own = principal.institucionId;
    if (!own) throw notFound();
    if (requested && !requested.equals(own)) throw notFound();
    return own;
  }
}
