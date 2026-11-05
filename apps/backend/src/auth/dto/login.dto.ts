import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo de `POST /auth/login` (plan §9.1, DEC-21). Validación explícita en cada propiedad; cualquier
 * otra propiedad → 400. El formato del correo no se valida aquí: un correo mal formado no existe y
 * recibe el mismo 401 genérico (RN-04, CA-07). Los máximos solo acotan el tamaño de la entrada.
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  correo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;

  /** Solo se exige cuando la cuenta está en desafío (DEC-16). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  captchaToken?: string;
}
