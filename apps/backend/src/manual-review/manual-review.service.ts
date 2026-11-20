import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminEvent, RecursoTipo } from '../audit/admin-event';
import { InstitutionScopePolicy } from '../authz/institution-scope.policy';
import type { Principal } from '../authz/principal';
import { ROLES_REVISION_MANUAL } from '../authz/permissions';
import { CLOCK, type Clock } from '../common/clock';
import { conflict, invalidField, notFound } from '../common/http/object-id';
import { ProblemException, ProblemType } from '../common/http/problem';
import { ResolucionManual, type ValorResuelto } from './resolucion-manual.schema';

export interface ResolverMarcaInput {
  readonly valorResuelto?: ValorResuelto;
  readonly verificada: boolean;
}

export interface ResolucionManualDto {
  readonly id: string;
  readonly valorResuelto: ValorResuelto | null;
  readonly verificada: boolean;
  readonly verificadaEn: string | null;
}

/** RN-16: «Verificada» solo con un valor resuelto. Regla pura, compartida con el frontend. */
export function canVerify(valor: ValorResuelto | null | undefined): valor is ValorResuelto {
  return valor !== null && valor !== undefined;
}

/**
 * Resolución manual de marcas dudosas (HT-AUTH-03 plan §2.3, DEC-07; RN-15, RN-16). En esta historia no
 * tiene endpoint: lo expondrá OMR-002 con `PATCH /revision-manual/marcas/:id`.
 * - `verificada: true` exige valor resuelto (400) y registra autor y fecha.
 * - Nunca se marca por defecto; sin marcarla, la marca sigue pendiente aunque tenga valor.
 * - Una marca ya verificada no se modifica (409), para que la confirmación no cambie en silencio.
 */
@Injectable()
export class ManualReviewService {
  constructor(
    @InjectModel(ResolucionManual.name) private readonly resoluciones: Model<ResolucionManual>,
    private readonly scope: InstitutionScopePolicy,
    private readonly audit: AdminAuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async resolve(principal: Principal, id: Types.ObjectId, input: ResolverMarcaInput): Promise<ResolucionManualDto> {
    if (principal.rol === null || !(ROLES_REVISION_MANUAL as readonly string[]).includes(principal.rol)) {
      throw new ProblemException(403, ProblemType.ACCESO_DENEGADO);
    }
    if (input.verificada && !canVerify(input.valorResuelto)) throw invalidField('verificada', 'requiereValorResuelto');

    const current = await this.resoluciones.findOne(this.scope.scoped(principal, { _id: id })).lean().exec();
    if (!current) throw notFound();
    if (current.verificada) throw conflict();

    const valor = input.valorResuelto ?? current.valor_resuelto;
    const now = this.clock.now();
    const updated = await this.resoluciones
      .findOneAndUpdate(
        this.scope.scoped(principal, { _id: id, verificada: false }),
        {
          $set: {
            valor_resuelto: valor,
            verificada: input.verificada,
            verificada_por: input.verificada ? principal.id : null,
            verificada_en: input.verificada ? now : null,
          },
        },
        { new: true, runValidators: true },
      )
      .lean()
      .exec();
    if (!updated) throw conflict();

    if (updated.verificada) {
      await this.audit.record({
        evento: AdminEvent.MARCA_VERIFICADA,
        actorId: principal.id,
        recursoTipo: RecursoTipo.RESOLUCION_MANUAL,
        recursoId: updated._id,
        institucionId: updated.institucion_id,
        detalle: { valor_resuelto: updated.valor_resuelto, estado_leido: updated.estado_leido },
      });
    }
    return {
      id: updated._id.toHexString(),
      valorResuelto: updated.valor_resuelto,
      verificada: updated.verificada,
      verificadaEn: updated.verificada_en ? updated.verificada_en.toISOString() : null,
    };
  }
}
