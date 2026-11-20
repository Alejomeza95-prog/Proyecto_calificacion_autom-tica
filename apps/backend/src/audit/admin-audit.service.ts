import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { currentCorrelationId } from '../observability/request-context';
import type { AdminEvent, RecursoTipo } from './admin-event';
import { AuditoriaAdmin, type DetalleAuditoria } from './auditoria-admin.schema';

/** Entrada de auditoría de negocio. El tipo no tiene campos para nombres, correos ni secretos (RN-17). */
export interface AdminAuditEntry {
  readonly evento: AdminEvent;
  readonly actorId: Types.ObjectId;
  readonly recursoTipo: RecursoTipo;
  readonly recursoId: Types.ObjectId;
  readonly institucionId?: Types.ObjectId | null;
  readonly detalle?: DetalleAuditoria | null;
}

/**
 * Auditoría de acciones de administración y negocio en `auditoria_admin` (HT-AUTH-03 plan §3.5, DEC-05).
 * Se inserta después de la escritura principal; si falla, se registra en el log con `correlationId` y la
 * operación de negocio no se revierte (riesgo aceptado en DEC-05 mientras DT-02 siga pendiente).
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(@InjectModel(AuditoriaAdmin.name) private readonly auditoria: Model<AuditoriaAdmin>) {}

  async record(entry: AdminAuditEntry): Promise<void> {
    try {
      await this.auditoria.create({
        evento: entry.evento,
        actor_id: entry.actorId,
        recurso_tipo: entry.recursoTipo,
        recurso_id: entry.recursoId,
        institucion_id: entry.institucionId ?? null,
        detalle: entry.detalle ?? null,
        correlation_id: currentCorrelationId() ?? null,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo auditar el evento ${entry.evento} (correlationId ${currentCorrelationId() ?? 'n/d'})`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}
