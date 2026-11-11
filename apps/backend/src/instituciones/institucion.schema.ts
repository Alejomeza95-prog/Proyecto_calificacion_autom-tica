import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const INSTITUCIONES_COLLECTION = 'instituciones';

/**
 * Catálogo mínimo `instituciones` (HT-AUTH-03 plan §3.2, DEC-03). Solo lectura por API; las altas llegan
 * por siembra controlada. La administración completa queda en DT-09.
 */
@Schema({
  collection: INSTITUCIONES_COLLECTION,
  timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' },
})
export class Institucion {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 200 })
  nombre!: string;

  @Prop({ type: Boolean, required: true, default: true })
  activa!: boolean;

  creado_en!: Date;
  actualizado_en!: Date;
}

export type InstitucionDocument = HydratedDocument<Institucion>;
export const InstitucionSchema = SchemaFactory.createForClass(Institucion);
