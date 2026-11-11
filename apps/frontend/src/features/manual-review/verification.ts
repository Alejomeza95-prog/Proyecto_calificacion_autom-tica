/** Copia de `apps/backend/src/manual-review/resolucion-manual.schema.ts` (HT-AUTH-03 spec §12: BLANK es válido). */
export const VALORES_RESUELTOS = ['A', 'B', 'C', 'D', 'BLANK'] as const;
export type ValorResuelto = (typeof VALORES_RESUELTOS)[number];

/** RN-16: «Verificada» solo con un valor resuelto (misma regla que `canVerify` del backend). */
export function canVerify(valor: ValorResuelto | null | undefined): valor is ValorResuelto {
  return valor !== null && valor !== undefined;
}
