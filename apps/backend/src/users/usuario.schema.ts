import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';
import { ROLES, roleInstitutionViolation, type Role } from '../authz/role';
import { hideSecretFields } from '../database/hide-secrets';
import { ACCOUNT_STATUSES, AccountStatus } from './account-status';
import { EMAIL_PATTERN } from './email-normalizer';

export const USUARIOS_COLLECTION = 'usuarios';

export const AccountOrigin = {
  AUTORREGISTRO: 'AUTORREGISTRO',
  INVITACION: 'INVITACION',
  BOOTSTRAP: 'BOOTSTRAP',
} as const;
export type AccountOrigin = (typeof AccountOrigin)[keyof typeof AccountOrigin];
export const ACCOUNT_ORIGINS: readonly AccountOrigin[] = Object.values(AccountOrigin);

/** Colección `usuarios` (plan §3.1). */
@Schema({
  collection: USUARIOS_COLLECTION,
  timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' },
})
export class Usuario {
  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion!: number;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 120 })
  nombre!: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true, maxlength: 254, match: EMAIL_PATTERN })
  correo_normalizado!: string;

  @Prop({ type: String, required: true, select: false })
  password_hash!: string;

  @Prop({ type: String, required: true, enum: ACCOUNT_STATUSES, default: AccountStatus.PENDIENTE_VERIFICACION })
  estado!: AccountStatus;

  @Prop({ type: String, enum: [...ROLES, null], default: null })
  rol!: Role | null;

  @Prop({ type: Types.ObjectId, ref: 'Institucion', default: null })
  institucion_id!: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: ACCOUNT_ORIGINS })
  origen!: AccountOrigin;

  @Prop({ type: Date, default: null })
  correo_verificado_en!: Date | null;

  @Prop({ type: Date, default: null })
  ultimo_acceso_en!: Date | null;

  @Prop({ type: Date, required: true, default: Date.now })
  credenciales_actualizadas_en!: Date;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  version_credenciales!: number;

  creado_en!: Date;
  actualizado_en!: Date;
}

export type UsuarioDocument = HydratedDocument<Usuario>;
export const UsuarioSchema = SchemaFactory.createForClass(Usuario);

// Validador de documento RN-15: rol e institución coherentes con el estado.
UsuarioSchema.pre('validate', function () {
  const violation = roleInstitutionViolation(this.estado, this.rol, this.institucion_id);
  if (violation) this.invalidate('rol', violation);
});

hideSecretFields(UsuarioSchema, ['password_hash']);
