import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import { CurrentPrincipal, OriginProtected, Public } from '../authz/decorators';
import type { Principal } from '../authz/principal';
import type { Role } from '../authz/role';
import type { HttpRequest, HttpResponse } from '../common/http/http-types';
import { ProblemException, ProblemType } from '../common/http/problem';
import type { AccountStatus } from '../users/account-status';
import { AuthSessionService, type SessionGrant } from './auth-session.service';
import { LoginDto } from './dto/login.dto';
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
  constructor(private readonly auth: AuthSessionService) {}

  private grant(response: HttpResponse, grant: SessionGrant): AccessTokenResponse {
    response.cookie(REFRESH_COOKIE, grant.refreshToken, refreshCookieOptions(grant.refreshExpiresAt));
    return { accessToken: grant.accessToken, expiresIn: grant.expiresIn };
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
