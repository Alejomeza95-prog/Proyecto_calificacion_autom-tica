import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { RAW_EMAIL_PATTERN } from './register.dto';

/**
 * Cuerpos de las operaciones de cuenta (plan §9.1, DEC-21). Clases concretas con validación explícita
 * en cada propiedad; cualquier otra propiedad → 400. El formato del token no se valida aquí: un token
 * mal formado recibe el mismo 400 genérico que uno inexistente y consume solo el límite por IP.
 */

/** `resend-verification` y `password/forgot`. */
export class EmailOnlyDto {
  @IsString()
  @MaxLength(254)
  @Matches(RAW_EMAIL_PATTERN)
  correo!: string;
}

/** `verify-email`. */
export class TokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token!: string;
}

/** `password/reset`. */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}

/** `activate` (primer administrador, CA-13). */
export class ActivateAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}
