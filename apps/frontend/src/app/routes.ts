/**
 * Rutas aprobadas de HT-AUTH-02 (plan §2.3). `/verificar-correo`, `/restablecer-contrasena` y
 * `/activar-cuenta` son contratos de `mail/link-builder.ts` del backend: no se renombran.
 */
export const ROUTES = {
  verificarCorreo: '/verificar-correo',
  restablecerContrasena: '/restablecer-contrasena',
  activarCuenta: '/activar-cuenta',
  iniciarSesion: '/iniciar-sesion',
  registro: '/registro',
  revisaTuCorreo: '/revisa-tu-correo',
  reenviarVerificacion: '/reenviar-verificacion',
  olvideContrasena: '/olvide-contrasena',
  inicio: '/inicio',
} as const;

export type ScreenKey = keyof typeof ROUTES;

/** Rutas privadas registradas: las únicas a las que se puede volver tras iniciar sesión (RN-16). */
export const PRIVATE_ROUTES: readonly string[] = [ROUTES.inicio];

/** Rutas que se abren desde un enlace con `#token=` (plan §2.5). */
const LINK_TOKEN_ROUTES: readonly string[] = [ROUTES.verificarCorreo, ROUTES.restablecerContrasena, ROUTES.activarCuenta];

export function isLinkTokenRoute(pathname: string): boolean {
  return LINK_TOKEN_ROUTES.includes(pathname.replace(/\/+$/, ''));
}

export const SCREEN_TITLES: Readonly<Record<ScreenKey, string>> = {
  verificarCorreo: 'Verificar correo',
  restablecerContrasena: 'Crear nueva contraseña',
  activarCuenta: 'Activar cuenta',
  iniciarSesion: 'Iniciar sesión',
  registro: 'Crear cuenta',
  revisaTuCorreo: 'Revisa tu correo',
  reenviarVerificacion: 'Reenviar verificación',
  olvideContrasena: 'Olvidé mi contraseña',
  inicio: 'Inicio',
};
