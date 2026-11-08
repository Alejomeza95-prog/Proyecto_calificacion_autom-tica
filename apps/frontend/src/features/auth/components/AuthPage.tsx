import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigationType } from 'react-router';
import styles from './AuthPage.module.css';
import { OmrSheetIllustration } from './OmrSheetIllustration.tsx';

export type AuthFlow = 'acceso' | 'registro' | 'recuperacion' | 'activacion';

interface AuthPageProps {
  /** Trámite al que pertenece la pantalla; queda en `data-flow` para estilos y pruebas. */
  readonly flow: AuthFlow;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}

/**
 * Plantilla de todas las pantallas del módulo: panel institucional y tarjeta con una sola acción principal.
 * Cada pantalla enlaza por sí misma los trámites relacionados, dentro de la tarjeta.
 */
export function AuthPage({ flow, title, description, children }: AuthPageProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const navigationType = useNavigationType();

  useEffect(() => {
    document.title = `${title} · OMR-PreICFES`;
  }, [title]);

  // Al cambiar de pantalla dentro de la aplicación, el foco no se pierde (RNF-01). Al abrirla no se mueve.
  useEffect(() => {
    if (navigationType !== 'POP') heading.current?.focus();
  }, [navigationType]);

  return (
    <div className={styles.page} data-flow={flow}>
      <header className={styles.panel}>
        <p className={styles.brand}>OMR-PreICFES</p>
        <div className={styles.pitch}>
          <p className={styles.statement}>Calificación automática de simulacros PreICFES.</p>
          <p className={styles.support}>
            Lee las hojas de respuesta, las asocia con cada estudiante y envía a revisión humana toda marca dudosa.
          </p>
        </div>
        <OmrSheetIllustration />
      </header>
      <main className={styles.main}>
        <div className={styles.card}>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {description && <p className={styles.description}>{description}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
