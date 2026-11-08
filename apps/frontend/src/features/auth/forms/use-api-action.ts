import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isApiError } from '../api/problem.ts';

export type ActionResult<T> =
  | { readonly ok: true; readonly value: T }
  /** `error: null`: no se envió, porque ya había un envío en curso o una espera vigente. */
  | { readonly ok: false; readonly error: ApiError | null };

/**
 * Estado de un envío a la API: evita el doble envío (CA-10) y bloquea la acción mientras dura el
 * `Retry-After` de un 429 (plan §9.1).
 */
export function useApiAction() {
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = useRef(false);
  const blockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(blockTimer.current), []);

  const blockFor = useCallback((seconds: number) => {
    setBlocked(true);
    blockTimer.current = setTimeout(() => {
      busy.current = false;
      setBlocked(false);
    }, seconds * 1000);
  }, []);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<ActionResult<T>> => {
      if (busy.current) return { ok: false, error: null };
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        const value = await action();
        busy.current = false;
        return { ok: true, value };
      } catch (caught) {
        const apiError = isApiError(caught) ? caught : new ApiError('desconocido');
        setError(apiError);
        if (apiError.kind === 'demasiados-intentos' && apiError.retryAfterSeconds !== null) {
          blockFor(apiError.retryAfterSeconds);
        } else {
          busy.current = false;
        }
        return { ok: false, error: apiError };
      } finally {
        setPending(false);
      }
    },
    [blockFor],
  );

  return { pending, blocked, error, run };
}
