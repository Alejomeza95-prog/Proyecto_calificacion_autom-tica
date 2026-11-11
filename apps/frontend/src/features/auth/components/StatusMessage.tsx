import type { ReactNode, Ref } from 'react';
import styles from './fields.module.css';

type StatusTone = 'error' | 'success' | 'info';

const ICON_PATHS: Readonly<Record<StatusTone, string>> = {
  error: 'M10 2 19 18H1L10 2ZM10 8v5M10 15v.5',
  success: 'M3 10.5 8 15.5 17 5',
  info: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM10 9v5M10 6v.5',
};

interface StatusMessageProps {
  readonly tone: StatusTone;
  readonly children: ReactNode;
  /** Permite mover el foco al resultado (RNF-01). */
  readonly ref?: Ref<HTMLDivElement>;
}

/** Resultado de una acción. Se anuncia a lectores de pantalla, y el icono y el texto evitan depender del color. */
export function StatusMessage({ tone, children, ref }: StatusMessageProps) {
  return (
    <div
      ref={ref}
      className={styles.status}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      tabIndex={-1}
    >
      <svg className={styles.statusIcon} viewBox="0 0 20 20" aria-hidden="true">
        <path
          d={ICON_PATHS[tone]}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>{children}</div>
    </div>
  );
}
