import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, isApiError } from '../auth/api/problem.ts';

export type LoadState<T> =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'listo'; readonly data: T }
  | { readonly estado: 'error'; readonly error: ApiError };

/**
 * Carga datos al montar y cuando cambian las dependencias de `loader`; `reload()` repite la carga.
 * Descarta respuestas de cargas anteriores. Mientras la carga vigente no responde, el estado es `cargando`
 * (derivado de la clave de la carga, sin `setState` dentro del efecto).
 */
export function useLoad<T>(loader: () => Promise<T>): { state: LoadState<T>; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(() => ({ loader, attempt }), [loader, attempt]);
  const [settled, setSettled] = useState<{ key: object; state: LoadState<T> } | null>(null);

  useEffect(() => {
    let current = true;
    key.loader().then(
      (data) => {
        if (current) setSettled({ key, state: { estado: 'listo', data } });
      },
      (error: unknown) => {
        if (current) {
          setSettled({ key, state: { estado: 'error', error: isApiError(error) ? error : new ApiError('desconocido') } });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [key]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state: LoadState<T> = settled !== null && settled.key === key ? settled.state : { estado: 'cargando' };
  return { state, reload };
}

/** Mensaje genérico para errores de carga o de acción sin un texto propio. */
export function genericErrorMessage(error: ApiError): string {
  switch (error.kind) {
    case 'acceso-denegado':
      return 'No tienes permiso para realizar esta acción.';
    case 'no-encontrado':
      return 'El elemento ya no existe o no está disponible para tu institución.';
    case 'red':
      return 'No hay conexión con el servicio. Revisa tu conexión e inténtalo de nuevo.';
    case 'no-autenticado':
      return 'Tu sesión terminó. Inicia sesión de nuevo.';
    case 'solicitud-invalida':
      return error.fields.length > 0
        ? `Revisa los datos enviados (${error.fields.join(', ')}) e inténtalo de nuevo.`
        : 'Revisa los datos enviados e inténtalo de nuevo.';
    case 'conflicto':
      return 'Otra persona cambió este elemento o ya existe uno igual. Recarga la página para ver la versión actual.';
    case 'origen-no-permitido':
      return 'La solicitud se bloqueó por seguridad. Recarga la página e inténtalo de nuevo.';
    case 'demasiados-intentos':
    case 'servicio-saturado':
    case 'limitador-no-disponible':
      return error.retryAfterSeconds !== null
        ? `El servicio está ocupado. Espera ${error.retryAfterSeconds} segundos e inténtalo de nuevo.`
        : 'El servicio está ocupado. Espera un momento e inténtalo de nuevo.';
    case 'error-interno':
      return 'El servidor tuvo un error inesperado. Inténtalo de nuevo en unos minutos.';
    default:
      return 'No pudimos completar la acción. Inténtalo de nuevo.';
  }
}
