import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Correo con espacios opcionales alrededor (se normalizan en el servicio, RN-03). */
export const RAW_EMAIL_PATTERN = /^\s*[^\s@]+@[^\s@]+\.[^\s@]+\s*$/;

/**
 * Cuerpo de `POST /auth/register` (plan §9.1, DEC-21).
 * - `nombre`, `correo` y `password` con validación explícita; la política de contraseña (12 a 128
 *   caracteres) la aplica el servicio y responde 422 (CA-03).
 * - `rol`, `institucion_id` e `institucionId` se **declaran, validan e ignoran** (CA-01, RN-02, RN-18): se
 *   admiten para que el registro funcione aunque la solicitud los traiga, pero el servicio nunca los lee.
 *   Cualquier otra propiedad no declarada (p. ej. `estado` u `origen`) → 400.
 */
export class RegisterDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  nombre!: string;

  @IsString()
  @MaxLength(254)
  @Matches(RAW_EMAIL_PATTERN)
  correo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;

  /** Código de una invitación; el rol y la institución se toman de ella **en el servidor** (DEC-07). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  invitacion?: string;

  /** Ignorada (RN-02). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  rol?: string;

  /** Ignorada (RN-02). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  institucion_id?: string;

  /** Ignorada (RN-02). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  institucionId?: string;
}
