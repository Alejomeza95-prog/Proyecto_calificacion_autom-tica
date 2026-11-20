import { useId } from 'react';
import { OPCIONES_CLAVE, type OpcionClave, type RespuestaClave } from './answer-keys-api.ts';
import styles from './AnswerGrid.module.css';

interface AnswerGridProps {
  readonly respuestas: readonly RespuestaClave[];
  /** Preguntas a resaltar (p. ej. faltantes al publicar). */
  readonly highlighted?: readonly number[];
  readonly readOnly?: boolean;
  readonly onChange?: (index: number, value: RespuestaClave) => void;
}

/**
 * Grilla de la clave (HT-AUTH-03 CA-06, CA-07, RN-08, RN-09): una fila por pregunta, numeradas desde 1, con
 * solo las opciones A, B, C y D. Cada fila es un grupo de radios con su leyenda, así que se recorre con
 * teclado (Tab entre preguntas, flechas entre opciones).
 */
export function AnswerGrid({ respuestas, highlighted = [], readOnly = false, onChange }: AnswerGridProps) {
  const name = useId();
  const marked = new Set(highlighted);

  return (
    <ol className={styles.grid} aria-label="Respuestas por pregunta">
      {respuestas.map((value, index) => {
        const numero = index + 1;
        return (
          <li key={numero} className={styles.row} data-missing={marked.has(numero) ? true : undefined}>
            <fieldset className={styles.fieldset} disabled={readOnly}>
              <legend className={styles.legend}>
                Pregunta {numero}
                {marked.has(numero) && <span className={styles.missingTag}> · sin respuesta</span>}
              </legend>
              <div className={styles.options}>
                {OPCIONES_CLAVE.map((opcion: OpcionClave) => (
                  <label key={opcion} className={styles.option}>
                    <input
                      type="radio"
                      className={styles.radio}
                      name={`${name}-${numero}`}
                      value={opcion}
                      checked={value === opcion}
                      onChange={() => onChange?.(index, opcion)}
                    />
                    <span className={styles.letter}>{opcion}</span>
                  </label>
                ))}
                {!readOnly && value !== null && (
                  <button
                    type="button"
                    className={styles.clear}
                    aria-label={`Borrar la respuesta de la pregunta ${numero}`}
                    onClick={() => onChange?.(index, null)}
                  >
                    Borrar
                  </button>
                )}
              </div>
            </fieldset>
          </li>
        );
      })}
    </ol>
  );
}
