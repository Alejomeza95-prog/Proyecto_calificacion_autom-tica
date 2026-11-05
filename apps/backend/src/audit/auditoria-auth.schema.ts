import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { AUDIT_RESULTS, AUTH_EVENTS, type AuditResult, type AuthEvent } from './auth-event';

export const AUDITORIA_AUTH_COLLECTION = 'auditoria_auth';

/**
 * Colección `auditoria_auth` (plan §3.4). Solo inserción. `strict: 'throw'` impide guardar
 * campos no declarados (por ejemplo, un correo o un token por error), RN-12.
 */
@Schema({
  collection: AUDITORIA_AUTH_COLLECTION,
  timestamps: { createdAt: 'creado_en', updatedAt: false },
  strict: 'throw',
})
export class AuditoriaAuth {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: String, required: true, enum: AUTH_EVENTS })
  evento!: AuthEvent;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', default: null })
  usuario_id!: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: AUDIT_RESULTS })
  resultado!: AuditResult;

  @Prop({ type: String, default: null, match: /^[0-9a-f]{64}$/ })
  ip_hash!: string | null;

  @Prop({ type: String, default: null, maxlength: 128 })
  correlation_id!: string | null;

  creado_en!: Date;
}

export type AuditoriaAuthDocument = HydratedDocument<AuditoriaAuth>;
export const AuditoriaAuthSchema = SchemaFactory.createForClass(AuditoriaAuth);
