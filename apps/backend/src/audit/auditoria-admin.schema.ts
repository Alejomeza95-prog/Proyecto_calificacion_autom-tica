import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { ADMIN_EVENTS, RECURSO_TIPOS, type AdminEvent, type RecursoTipo } from './admin-event';

export const AUDITORIA_ADMIN_COLLECTION = 'auditoria_admin';

/**
 * Detalle de un evento: solo valores no personales (estados, rol, cantidades, materia). El tipo no admite
 * objetos anidados ni texto libre largo, para que nunca termine un nombre o un correo aquí (RN-17).
 */
export type DetalleAuditoria = Readonly<Record<string, string | number | boolean | null>>;

/** Colección `auditoria_admin` (HT-AUTH-03 plan §3.5, DEC-05). Solo inserción; `strict: 'throw'`. */
@Schema({
  collection: AUDITORIA_ADMIN_COLLECTION,
  timestamps: { createdAt: 'creado_en', updatedAt: false },
  strict: 'throw',
})
export class AuditoriaAdmin {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: String, required: true, enum: ADMIN_EVENTS })
  evento!: AdminEvent;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  actor_id!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: RECURSO_TIPOS })
  recurso_tipo!: RecursoTipo;

  @Prop({ type: Types.ObjectId, required: true })
  recurso_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Institucion', default: null })
  institucion_id!: Types.ObjectId | null;

  @Prop({
    type: Object,
    default: null,
    validate: {
      validator: (v: unknown) =>
        v === null ||
        (typeof v === 'object' &&
          Object.values(v as Record<string, unknown>).every(
            (x) => x === null || ['number', 'boolean'].includes(typeof x) || (typeof x === 'string' && x.length <= 64),
          )),
      message: 'detalle solo admite valores simples y cortos',
    },
  })
  detalle!: DetalleAuditoria | null;

  @Prop({ type: String, default: null, maxlength: 128 })
  correlation_id!: string | null;

  creado_en!: Date;
}

export type AuditoriaAdminDocument = HydratedDocument<AuditoriaAdmin>;
export const AuditoriaAdminSchema = SchemaFactory.createForClass(AuditoriaAdmin);
