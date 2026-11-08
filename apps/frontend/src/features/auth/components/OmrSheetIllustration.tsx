import type { CSSProperties } from 'react';
import styles from './AuthPage.module.css';

const OPTIONS = ['A', 'B', 'C', 'D'] as const;

/** Respuestas sintéticas: una por fila, salvo la fila dudosa, que lleva dos marcas y va a revisión. */
const ROWS: readonly (readonly number[])[] = [[1], [3], [0], [2], [1, 2], [0], [3], [1]];
const REVIEW_ROW = 4;

/** Orden de aparición de cada marca en la animación, fila por fila. */
const MARK_ORDER: readonly (readonly number[])[] = ROWS.map((marks, row) => {
  const before = ROWS.slice(0, row).reduce((total, previous) => total + previous.length, 0);
  return marks.map((_, index) => before + index);
});
/** La bandera de revisión aparece después de la última marca de la hoja. */
const REVIEW_ORDER = ROWS.flat().length;

const SHEET_X = 24;
const FIRST_ROW_Y = 132;
const ROW_GAP = 30;
const FIRST_BUBBLE_X = 106;
const BUBBLE_GAP = 34;
const BUBBLE_R = 10;

function bubbleX(option: number): number {
  return FIRST_BUBBLE_X + option * BUBBLE_GAP;
}

function rowY(row: number): number {
  return FIRST_ROW_Y + row * ROW_GAP;
}

/**
 * Hoja de respuestas OMR dibujada en código (sin recursos externos, RN-07). Decorativa: el contenido es sintético
 * y no se anuncia. Muestra el principio del producto: una lectura dudosa no se califica, va a revisión.
 */
export function OmrSheetIllustration() {
  return (
    <svg className={styles.sheet} viewBox="0 0 320 400" aria-hidden="true" focusable="false">
      <rect x={SHEET_X} y="12" width="272" height="376" rx="12" fill="#ffffff" />

      {/* Fiduciales de las esquinas: el motor OMR los usa para enderezar la hoja. */}
      {[
        [SHEET_X + 14, 26],
        [SHEET_X + 244, 26],
        [SHEET_X + 14, 360],
        [SHEET_X + 244, 360],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="14" height="14" rx="2" fill="#1b2440" />
      ))}

      {/* Encabezado: nombre y código del estudiante, sin datos reales. */}
      <rect x={SHEET_X + 46} y="30" width="120" height="8" rx="4" fill="#c5cde0" />
      <rect x={SHEET_X + 46} y="48" width="84" height="6" rx="3" fill="#dde2ec" />
      <rect x={SHEET_X + 46} y="70" width="180" height="1.5" fill="#dde2ec" />

      {OPTIONS.map((option, index) => (
        <text key={option} className={styles.sheetLabel} x={bubbleX(index)} y="108" textAnchor="middle">
          {option}
        </text>
      ))}

      {ROWS.map((marks, row) => {
        const y = rowY(row);
        const isReview = row === REVIEW_ROW;
        return (
          <g key={row}>
            {/* Marca de sincronización del borde izquierdo. */}
            <rect x={SHEET_X + 14} y={y - 3} width="12" height="6" rx="1" fill="#1b2440" />
            <text className={styles.sheetLabel} x={SHEET_X + 52} y={y + 4} textAnchor="end">
              {row + 1}
            </text>
            {OPTIONS.map((option, index) => (
              <circle
                key={option}
                cx={bubbleX(index)}
                cy={y}
                r={BUBBLE_R}
                fill="none"
                stroke="#b8c2da"
                strokeWidth="1.5"
              />
            ))}
            {marks.map((option, index) => (
              <circle
                key={option}
                className={styles.mark}
                style={{ '--i': MARK_ORDER[row]?.[index] ?? 0 } as CSSProperties}
                cx={bubbleX(option)}
                cy={y}
                r={BUBBLE_R - 2.5}
                fill={isReview ? '#5d75c9' : 'var(--primary)'}
              />
            ))}
            {isReview && (
              <g className={styles.review} style={{ '--i': REVIEW_ORDER } as CSSProperties}>
                <rect
                  className={styles.reviewRing}
                  style={{ '--i': REVIEW_ORDER } as CSSProperties}
                  x={bubbleX(1) - 17}
                  y={y - 17}
                  width={BUBBLE_GAP + 34}
                  height="34"
                  rx="17"
                  fill="none"
                  stroke="var(--review)"
                  strokeWidth="3"
                  pathLength="1"
                />
                <rect x={bubbleX(3) + 16} y={y - 12} width="62" height="24" rx="12" fill="var(--review)" />
                <text className={styles.reviewLabel} x={bubbleX(3) + 47} y={y + 4} textAnchor="middle">
                  Revisión
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
