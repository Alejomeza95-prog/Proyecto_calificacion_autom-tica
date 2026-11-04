import { Inject, Injectable } from '@nestjs/common';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';

/** Pantallas del frontend que reciben un token (plan §5 y §11). Rutas fijas: no hay `redirect` libre. */
export const LINK_PATHS = {
  verificarCorreo: '/verificar-correo',
  restablecerPassword: '/restablecer-contrasena',
  activarCuenta: '/activar-cuenta',
} as const;
export type LinkKind = keyof typeof LINK_PATHS;

/**
 * Construye los enlaces de los correos solo desde `APP_PUBLIC_URL`, validada al arrancar contra
 * `AUTH_ALLOWED_ORIGINS` (RN-13, T-11). Nunca usa `Host` ni `X-Forwarded-Host` de la solicitud.
 * El token va **solo en el fragmento** (`#token=`), que el navegador no envía al servidor (DEC-18).
 */
@Injectable()
export class LinkBuilder {
  constructor(@Inject(AUTH_CONFIG) private readonly config: Pick<AuthConfig, 'appPublicUrl'>) {}

  build(kind: LinkKind, token: string): string {
    const url = new URL(LINK_PATHS[kind], this.config.appPublicUrl);
    url.hash = `token=${encodeURIComponent(token)}`;
    return url.toString();
  }
}
