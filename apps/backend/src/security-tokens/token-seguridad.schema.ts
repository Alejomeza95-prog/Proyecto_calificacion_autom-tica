import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { hideSecretFields } from '../database/hide-secrets';
import { TOKEN_PURPOSES, type TokenPurpose } from './token-purpose';

export const TOKENS_SEGURIDAD_COLLECTION = 'tokens_seguridad';

/** Colección `tokens_seguridad` (plan §3.2). Solo guarda el SHA-256 del token (RN-06). */
@Schema({ collection: TOKENS_SEGURIDAD_COLLECTION, timestamps: { createdAt: 'creado_en', updatedAt: false } })
export class TokenSeguridad {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  usuario_id!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: TOKEN_PURPOSES })
  proposito!: TokenPurpose;

  @Prop({ type: String, required: true, match: /^[0-9a-f]{64}$/, select: false })
  token_hash!: string;

  @Prop({ type: Date, required: true })
  expira_en!: Date;

  @Prop({ type: Date, default: null })
  usado_en!: Date | null;

  @Prop({ type: Date, default: null })
  invalidado_en!: Date | null;

  creado_en!: Date;
}

export type TokenSeguridadDocument = HydratedDocument<TokenSeguridad>;
export const TokenSeguridadSchema = SchemaFactory.createForClass(TokenSeguridad);
hideSecretFields(TokenSeguridadSchema, ['token_hash']);
