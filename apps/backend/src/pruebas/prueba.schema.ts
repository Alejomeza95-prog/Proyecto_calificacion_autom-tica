import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export const PRUEBAS_COLLECTION = 'pruebas';

/** Catálogo mínimo `pruebas` por institución (HT-AUTH-03 plan §3.3, DEC-04). */
@Schema({
  collection: PRUEBAS_COLLECTION,
  timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' },
})
export class Prueba {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: Types.ObjectId, ref: 'Institucion', required: true })
  institucion_id!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 200 })
  nombre!: string;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  creado_por!: Types.ObjectId;

  creado_en!: Date;
  actualizado_en!: Date;
}

export type PruebaDocument = HydratedDocument<Prueba>;
export const PruebaSchema = SchemaFactory.createForClass(Prueba);
