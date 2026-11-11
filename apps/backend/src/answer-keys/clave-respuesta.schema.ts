import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import {
  ESTADOS_CLAVE,
  EstadoClave,
  MATERIAS,
  MAX_PREGUNTAS,
  MIN_PREGUNTAS,
  OPCIONES_CLAVE,
  SESIONES,
  type Materia,
  type RespuestaClave,
  type Sesion,
} from './answer-key.constants';
import { isComplete } from './answer-key.rules';

export const CLAVES_RESPUESTA_COLLECTION = 'claves_respuesta';

/**
 * Colección `claves_respuesta` (HT-AUTH-03 plan §3.4, DEC-02, DEC-08). Respuestas embebidas; concurrencia
 * optimista con la clave de versión `version`. `institucion_id` se copia de la prueba al crear (RN-13).
 */
@Schema({
  collection: CLAVES_RESPUESTA_COLLECTION,
  timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' },
  optimisticConcurrency: true,
  versionKey: 'version',
})
export class ClaveRespuesta {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: Types.ObjectId, ref: 'Institucion', required: true })
  institucion_id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Prueba', required: true })
  prueba_id!: Types.ObjectId;

  /** Solo el día, normalizado a 00:00 UTC. */
  @Prop({
    type: Date,
    required: true,
    validate: {
      validator: (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0,
      message: 'fecha debe ser un día sin hora (00:00 UTC)',
    },
  })
  fecha!: Date;

  @Prop({ type: String, required: true, enum: SESIONES })
  sesion!: Sesion;

  @Prop({ type: String, required: true, enum: MATERIAS })
  materia!: Materia;

  @Prop({
    type: Number,
    required: true,
    min: MIN_PREGUNTAS,
    max: MAX_PREGUNTAS,
    validate: { validator: Number.isInteger, message: 'cantidad_preguntas debe ser entero' },
  })
  cantidad_preguntas!: number;

  @Prop({ type: [{ type: String, enum: [...OPCIONES_CLAVE, null] }], required: true, default: undefined })
  respuestas!: RespuestaClave[];

  @Prop({ type: String, required: true, enum: ESTADOS_CLAVE, default: EstadoClave.BORRADOR })
  estado!: EstadoClave;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  creado_por!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', required: true })
  actualizado_por!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  publicada_en!: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'Usuario', default: null })
  publicada_por!: Types.ObjectId | null;

  version!: number;
  creado_en!: Date;
  actualizado_en!: Date;
}

export type ClaveRespuestaDocument = HydratedDocument<ClaveRespuesta>;
export const ClaveRespuestaSchema = SchemaFactory.createForClass(ClaveRespuesta);

/** Motivo por el que el documento es incoherente, o `null` (RN-08, RN-10). Reutilizado por el servicio. */
export function claveViolation(doc: {
  cantidad_preguntas: number;
  respuestas: readonly RespuestaClave[];
  estado: EstadoClave;
  publicada_en: Date | null;
  publicada_por: Types.ObjectId | null;
}): { campo: string; motivo: string } | null {
  if (!Array.isArray(doc.respuestas) || doc.respuestas.length !== doc.cantidad_preguntas) {
    return { campo: 'respuestas', motivo: 'la cantidad de respuestas debe ser igual a cantidad_preguntas' };
  }
  if (doc.estado === EstadoClave.PUBLICADA) {
    if (!isComplete(doc.respuestas)) return { campo: 'respuestas', motivo: 'una clave PUBLICADA exige todas las respuestas' };
    if (!doc.publicada_en || !doc.publicada_por) {
      return { campo: 'publicada_por', motivo: 'una clave PUBLICADA exige fecha y autor de publicación' };
    }
  }
  return null;
}

ClaveRespuestaSchema.pre('validate', function () {
  const violation = claveViolation(this);
  if (violation) this.invalidate(violation.campo, violation.motivo);
});
