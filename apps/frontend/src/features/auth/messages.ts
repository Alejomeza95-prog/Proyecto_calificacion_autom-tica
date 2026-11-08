import type { ApiError } from './api/problem.ts';
import { PASSWORD_MAX, PASSWORD_MIN } from './validation.ts';

function formatWait(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? '1 segundo' : `${seconds} segundos`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

const UNAVAILABLE = 'El servicio no está disponible en este momento. Lo que escribiste sigue aquí: inténtalo de nuevo en unos minutos.';
const GENERIC = 'Algo salió mal y no pudimos completar la solicitud. Lo que escribiste sigue aquí: inténtalo de nuevo.';

/** Traducción común de los problemas de la API (plan §9.1). Sin códigos ni términos técnicos (RNF-03). */
export function problemMessage(error: ApiError): string {
  switch (error.kind) {
    case 'demasiados-intentos':
      return error.retryAfterSeconds === null
        ? 'Hiciste demasiados intentos. Intenta más tarde.'
        : `Hiciste demasiados intentos. Podrás intentarlo de nuevo en ${formatWait(error.retryAfterSeconds)}.`;
    case 'limitador-no-disponible':
    case 'servicio-saturado':
    case 'verificacion-no-disponible':
      return UNAVAILABLE;
    case 'origen-no-permitido':
      return 'No pudimos procesar la solicitud por un error de configuración del sistema. Avísale a quien lo administra.';
    case 'red':
      return 'No pudimos conectarnos. Revisa tu conexión: lo que escribiste sigue aquí.';
    default:
      return GENERIC;
  }
}

/** Fija y sin condiciones: igual para todo rechazo, no revela el estado de ninguna cuenta (RN-05, RN-09). */
export const LOGIN_GUIDANCE =
  '¿No puedes entrar? Si acabas de crear tu cuenta, confirma tu correo; algunas cuentas necesitan la aprobación de un administrador.';

export const CAPTCHA_UNAVAILABLE = 'No podemos completar la verificación de seguridad en este momento. Intenta de nuevo en unos minutos.';

export const SESSION_END_MESSAGES = {
  'sesion-perdida': 'Tu sesión terminó. Inicia sesión de nuevo para continuar.',
  'cuenta-no-habilitada': 'Tu cuenta no está habilitada para entrar. Comunícate con quien administra el sistema.',
  'cierre-de-sesion': 'Tu sesión se cerró.',
} as const;

/** Error junto al campo de contraseña cuando el backend aplica la política publicada (RNF-02). */
export const PASSWORD_POLICY_ERROR = `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`;
