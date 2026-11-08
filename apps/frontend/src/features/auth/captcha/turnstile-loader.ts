/** Parte de la API de Cloudflare Turnstile que usa esta aplicación. */
export interface TurnstileRenderOptions {
  readonly sitekey: string;
  /** El backend rechaza cualquier otra acción (`HT-AUTH-01/DEC-16`). */
  readonly action: 'login';
  readonly language: 'es';
  readonly callback: (token: string) => void;
  readonly 'error-callback': () => boolean;
  readonly 'expired-callback': () => void;
  readonly 'timeout-callback': () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Un script que no responde cuenta como no disponible: la persona recibe el aviso y puede reintentar (plan §2.6). */
export const TURNSTILE_LOAD_TIMEOUT_MS = 15_000;

let loading: Promise<TurnstileApi> | null = null;

/** Carga el script una sola vez y solo cuando se pide, tras un desafío (RN-07). Si falla, se puede reintentar. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;

  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');

    function settle(): void {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      loading = null;
    }

    function fail(reason: string): void {
      settle();
      script.remove();
      reject(new Error(reason));
    }

    const timer = setTimeout(() => fail('Turnstile tardó demasiado en cargar'), TURNSTILE_LOAD_TIMEOUT_MS);
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (!window.turnstile) {
        fail('Turnstile no está disponible');
        return;
      }
      settle();
      resolve(window.turnstile);
    };
    script.onerror = () => fail('No se pudo cargar Turnstile');
    document.head.append(script);
  });
  return loading;
}
