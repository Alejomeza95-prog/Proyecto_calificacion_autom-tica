import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const MIGRACIONES_COLLECTION = 'migraciones';

/** Colección `migraciones` (plan §3.5, DEC-12). Solo la escribe `MigrationRunner`. */
@Schema({ collection: MIGRACIONES_COLLECTION, timestamps: false, versionKey: false })
export class Migracion {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: String, required: true, match: /^[0-9a-f]{64}$/ })
  checksum!: string;

  @Prop({ type: Date, required: true })
  aplicada_en!: Date;

  @Prop({ type: Number, required: true, min: 0 })
  duracion_ms!: number;
}

export const MigracionSchema = SchemaFactory.createForClass(Migracion);
