import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref } from 'react';
import fieldStyles from '../components/fields.module.css';
import { loadTurnstile } from './turnstile-loader.ts';

export interface TurnstileHandle {
  /** La respuesta es de un solo uso: se reinicia tras cada intento (plan §2.6). */
  reset(): void;
}

interface TurnstileWidgetProps {
  readonly siteKey: string | null;
  /** `null` cuando la respuesta vence o se agota el tiempo: hay que resolver de nuevo. */
  readonly onToken: (token: string | null) => void;
  /** Sin sitekey, con el script bloqueado o con un error del widget. No existe vía alternativa (RN-10). */
  readonly onUnavailable: () => void;
  readonly ref?: Ref<TurnstileHandle>;
}

export function TurnstileWidget({ siteKey, onToken, onUnavailable, ref }: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const emitToken = useEffectEvent(onToken);
  const emitUnavailable = useEffectEvent(onUnavailable);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
    },
  }));

  useEffect(() => {
    if (siteKey === null) {
      emitUnavailable();
      return undefined;
    }

    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widgetId.current = api.render(container.current, {
          sitekey: siteKey,
          action: 'login',
          language: 'es',
          callback: (token) => emitToken(token),
          'error-callback': () => {
            emitToken(null);
            emitUnavailable();
            return true;
          },
          'expired-callback': () => emitToken(null),
          'timeout-callback': () => emitToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) emitUnavailable();
      });

    return () => {
      cancelled = true;
      if (widgetId.current !== null) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  return <div ref={container} className={fieldStyles.field} role="group" aria-label="Verificación de seguridad" />;
}
