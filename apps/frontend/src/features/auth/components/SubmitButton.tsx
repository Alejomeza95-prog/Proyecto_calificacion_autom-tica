import type { ReactNode } from 'react';
import styles from './fields.module.css';

interface SubmitButtonProps {
  readonly pending?: boolean;
  /** Texto mientras se envía, por ejemplo «Enviando…». */
  readonly pendingLabel: string;
  readonly children: ReactNode;
}

/**
 * Acción principal. Durante el envío usa `aria-disabled` y no `disabled`, para no perder el foco;
 * cancelar el clic también detiene el envío implícito con Enter, así que no hay doble envío.
 */
export function SubmitButton({ pending = false, pendingLabel, children }: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className={styles.submit}
      aria-disabled={pending ? true : undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {pending && <span className={styles.spinner} aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
