import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import { CurrentPrincipal, OriginProtected, Public } from '../authz/decorators';
import type { Principal } from '../authz/principal';
import type { Role } from '../authz/role';
import type { HttpRequest, HttpResponse } from '../common/http/http-types';
import { ProblemException, ProblemType } from '../common/http/problem';
import type { AccountStatus } from '../users/account-status';
import { AuthAccountService } from './auth-account.service';
import { AuthSessionService, type SessionGrant } from './auth-session.service';
import { ActivateAccountDto, EmailOnlyDto, ResetPasswordDto, TokenDto } from './dto/account-dtos';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { readRefreshCookie, REFRESH_COOKIE, refreshCookieOptions } from './refresh-cookie';

/** Respuesta de `/login` y `/refresh`: el token de renovación nunca va en el cuerpo (DEC-01, RNF-06). */
export interface AccessTokenResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
}

/** `GET /auth/me` (plan §9.1): sin `password_hash` ni hashes (RN-05). */
export interface MeResponse {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Role | null;
  readonly institucionId: string | null;
  readonly estado: AccountStatus;
}

/** Respuesta genérica (202) de registro, reenvío y recuperación: idéntica en todos los casos (RN-04). */
export interface GenericMessage {
  readonly mensaje: string;
}

export const REGISTER_MESSAGE = 'Si el correo puede registrarse, te enviamos un enlace de verificación.';
export const RESEND_MESSAGE = 'Si el correo tiene una verificación pendiente, te enviamos un nuevo enlace.';
/** Recuerda el reenvío de verificación sin revelar el estado de la cuenta (spec §6.3, DEC-19). */
export const FORGOT_MESSAGE =
  'Si la cuenta puede recuperar su contraseña, te enviamos un enlace. Si aún no verificaste tu correo, solicita un nuevo enlace de verificación.';

/** `POST /auth/verify-email` (plan §8). */
export interface VerifyEmailResponse {
  readonly estado: AccountStatus;
}

function clientIp(request: HttpRequest): string {
  return request.ip ?? '';
}

/**
 * Rutas de sesión de `/api/v1/auth` (T-17, T-19). `@OriginProtected()`: toda ruta `POST` exige un
 * `Origin` permitido antes de cualquier efecto (DEC-20). Las respuestas no se guardan en cachés.
 */
@OriginProtected()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthSessionService,
    private readonly accounts: AuthAccountService,
  ) {}

  private grant(response: HttpResponse, grant: SessionGrant): AccessTokenResponse {
    response.cookie(REFRESH_COOKIE, grant.refreshToken, refreshCookieOptions(grant.refreshExpiresAt));
    return { accessToken: grant.accessToken, expiresIn: grant.expiresIn };
  }

  /** T-15: el cuerpo nunca transporta rol ni institución al servicio (RN-02, RN-18). */
  @Public()
  @Post('register')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async register(@Body() body: RegisterDto, @Req() request: HttpRequest): Promise<GenericMessage> {
    await this.accounts.register(
      {
        nombre: body.nombre,
        correo: body.correo,
        password: body.password,
        ...(body.invitacion ? { invitacion: body.invitacion } : {}),
      },
      clientIp(request),
    );
    return { mensaje: REGISTER_MESSAGE };
  }

  /** T-16: verificación solo por `POST` con el token del fragmento del enlace (DEC-18). */
  @Public()
  @Post('verify-email')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async verifyEmail(@Body() body: TokenDto, @Req() request: HttpRequest): Promise<VerifyEmailResponse> {
    return { estado: await this.accounts.verifyEmail(body.token, clientIp(request)) };
  }

  /** T-16: respuesta 202 idéntica exista o no la cuenta (RN-04). */
  @Public()
  @Post('resend-verification')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async resendVerification(@Body() body: EmailOnlyDto, @Req() request: HttpRequest): Promise<GenericMessage> {
    await this.accounts.resendVerification(body.correo, clientIp(request));
    return { mensaje: RESEND_MESSAGE };
  }

  /** T-18: respuesta 202 idéntica para cualquier correo y estado (RN-04, DEC-19). */
  @Public()
  @Post('password/forgot')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  async forgotPassword(@Body() body: EmailOnlyDto, @Req() request: HttpRequest): Promise<GenericMessage> {
    await this.accounts.forgotPassword(body.correo, clientIp(request));
    return { mensaje: FORGOT_MESSAGE };
  }

  /** T-18: 204 sin cuerpo; token inválido o cuenta no elegible → 400 genérico. */
  @Public()
  @Post('password/reset')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async resetPassword(@Body() body: ResetPasswordDto, @Req() request: HttpRequest): Promise<void> {
    await this.accounts.resetPassword(body.token, body.password, clientIp(request));
  }

  /** T-36: activación del primer administrador con el enlace de `bootstrap:admin`; 204, sin iniciar sesión. */
  @Public()
  @Post('activate')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async activate(@Body() body: ActivateAccountDto, @Req() request: HttpRequest): Promise<void> {
    await this.accounts.activateAccount(body.token, body.password, clientIp(request));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() body: LoginDto,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<AccessTokenResponse> {
    const grant = await this.auth.login(
      { correo: body.correo, password: body.password, ...(body.captchaToken ? { captchaToken: body.captchaToken } : {}) },
      clientIp(request),
    );
    return this.grant(response, grant);
  }

  /** Autenticada solo por la cookie (no por el JWT, que puede haber vencido). */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<AccessTokenResponse> {
    const grant = await this.auth.refresh(readRefreshCookie(request), clientIp(request));
    if (!grant) throw new ProblemException(401, ProblemType.NO_AUTENTICADO);
    return this.grant(response, grant);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentPrincipal() principal: Principal,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<void> {
    await this.auth.logout(principal, clientIp(request));
    response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentPrincipal() principal: Principal): MeResponse {
    return {
      id: principal.id.toHexString(),
      nombre: principal.nombre,
      rol: principal.rol,
      institucionId: principal.institucionId?.toHexString() ?? null,
      estado: principal.estado,
    };
  }
}
