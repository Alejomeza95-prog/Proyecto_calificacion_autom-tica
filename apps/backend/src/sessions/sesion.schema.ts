import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { hideSecretFields } from '../database/hide-secrets';

export const SESIONES_COLLECTION = 'sesiones';

export const RevocationReason = {
  LOGOUT: 'LOGOUT',
  RESET_PASSWORD: 'RESET_PASSWORD',
  ADMIN: 'ADMIN',
  REUTILIZACION: 'REUTILIZACION',
  CUENTA_NO_ACTIVA: 'CUENTA_NO_ACTIVA',
  LIMITE_ROTACIONES: 'LIMITE_ROTACIONES',
} as const;
export type RevocationReason = (typeof RevocationReason)[keyof typeof RevocationReason];
export const REVOCATION_REASONS: readonly RevocationReason[] = Object.values(RevocationReason);

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Colección `sesiones` (plan §3.3). La sesión es la familia de tokens de renovación (DEC-01). */
@Schema({ collection: SESIONES_COLLECTION, timestamps: { createdAt: 'creado_en', updatedAt: false } })
export class Sesion {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  usuario_id!: Types.ObjectId;

  @Prop({ type: String, required: true, match: SHA256_HEX, select: false })
  refresh_hash!: string;

  /** SHA-256 de todos los tokens ya rotados. Solo crece (`$push`); nunca se recorta (DEC-01). */
  @Prop({ type: [String], default: [], select: false })
  refresh_hashes_previos!: string[];

  @Prop({ type: Number, required: true, min: 0 })
  version_credenciales!: number;

  @Prop({ type: Date, required: true })
  expira_en!: Date;

  @Prop({ type: Date, default: null })
  revocada_en!: Date | null;

  @Prop({ type: String, enum: [...REVOCATION_REASONS, null], default: null })
  motivo_revocacion!: RevocationReason | null;

  creado_en!: Date;
}

export type SesionDocument = HydratedDocument<Sesion>;
export const SesionSchema = SchemaFactory.createForClass(Sesion);
hideSecretFields(SesionSchema, ['refresh_hash', 'refresh_hashes_previos']);
