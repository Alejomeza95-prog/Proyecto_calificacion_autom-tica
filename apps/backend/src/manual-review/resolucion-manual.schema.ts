import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { MATERIAS, type Materia } from '../answer-keys/answer-key.constants';

export const RESOLUCIONES_MANUALES_COLLECTION = 'resoluciones_manuales';

/** Estados de lectura que llegan a revisión manual (RN-15). */
export const ESTADOS_DUDOSOS = ['UNCERTAIN', 'MULTIPLE'] as const;
export type EstadoDudoso = (typeof ESTADOS_DUDOSOS)[number];

/** Valores con los que una persona resuelve una marca dudosa (spec §12: BLANK es válido). */
export const VALORES_RESUELTOS = ['A', 'B', 'C', 'D', 'BLANK'] as const;
export type ValorResuelto = (typeof VALORES_RESUELTOS)[number];

/**
 * Colección `resoluciones_manuales` (HT-AUTH-03 plan §3.6, DEC-07). Esquema en esta historia; índices y
 * endpoint en OMR-002. Invariante RN-16: `verificada` exige valor resuelto, autor y fecha.
 */
@Schema({
  collection: RESOLUCIONES_MANUALES_COLLECTION,
  timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' },
})
export class ResolucionManual {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: Types.ObjectId, ref: 'Institucion', required: true })
  institucion_id!: Types.ObjectId;

  /** Lectura de OMR-002 (colección aún no definida). */
  @Prop({ type: Types.ObjectId, required: true })
  lectura_id!: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'entero' } })
  numero_pregunta!: number;

  @Prop({ type: String, required: true, enum: MATERIAS })
  materia!: Materia;

  @Prop({ type: String, required: true, enum: ESTADOS_DUDOSOS })
  estado_leido!: EstadoDudoso;

  @Prop({ type: String, enum: [...VALORES_RESUELTOS, null], default: null })
  valor_resuelto!: ValorResuelto | null;

  /** Nunca verdadero por defecto (RN-16). */
  @Prop({ type: Boolean, required: true, default: false })
  verificada!: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', default: null })
  verificada_por!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  verificada_en!: Date | null;

  creado_en!: Date;
  actualizado_en!: Date;
}

export type ResolucionManualDocument = HydratedDocument<ResolucionManual>;
export const ResolucionManualSchema = SchemaFactory.createForClass(ResolucionManual);

/** Motivo de incoherencia de RN-16, o `null`. */
export function verificationViolation(doc: {
  verificada: boolean;
  valor_resuelto: ValorResuelto | null;
  verificada_por: Types.ObjectId | null;
  verificada_en: Date | null;
}): string | null {
  if (!doc.verificada) return null;
  if (doc.valor_resuelto === null) return 'una marca verificada exige un valor resuelto';
  if (!doc.verificada_por || !doc.verificada_en) return 'una marca verificada exige autor y fecha';
  return null;
}

ResolucionManualSchema.pre('validate', function () {
  const violation = verificationViolation(this);
  if (violation) this.invalidate('verificada', violation);
});
