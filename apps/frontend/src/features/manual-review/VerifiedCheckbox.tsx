import { useId } from 'react';
import styles from './VerifiedCheckbox.module.css';
import { canVerify, type ValorResuelto } from './verification.ts';

interface VerifiedCheckboxProps {
  /** Valor elegido por la persona revisora; `null` mientras no elige. */
  readonly valorResuelto: ValorResuelto | null;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Ya guardada como verificada: solo lectura. */
  readonly locked?: boolean;
}

/**
 * Casilla «Verificada» de la resolución manual de una marca dudosa (HT-AUTH-03 CA-13, RN-16).
 * - Deshabilitada y desmarcada hasta elegir el valor resuelto.
 * - Nunca se marca sola: el estado lo controla la pantalla y solo cambia con la acción de la persona.
 * - Si se quita el valor, se muestra desmarcada aunque `checked` siga en verdadero.
 * El guardado y la cola de revisión llegan con OMR-002 (DEC-07).
 */
export function VerifiedCheckbox({ valorResuelto, checked, onChange, locked = false }: VerifiedCheckboxProps) {
  const id = useId();
  const hintId = useId();
  const enabled = canVerify(valorResuelto) && !locked;
  const isChecked = canVerify(valorResuelto) && checked;

  return (
    <div className={styles.wrapper} data-checked={isChecked ? true : undefined}>
      <input
        id={id}
        type="checkbox"
        className={styles.checkbox}
        checked={isChecked}
        disabled={!enabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id} className={styles.label}>
        Verificada
      </label>
      <span id={hintId} className={styles.hint}>
        {locked
          ? 'Resolución confirmada.'
          : canVerify(valorResuelto)
            ? 'Marca la casilla para confirmar el valor elegido. Sin marcarla, la marca sigue pendiente.'
            : 'Elige primero el valor resuelto de la marca.'}
      </span>
    </div>
  );
}
