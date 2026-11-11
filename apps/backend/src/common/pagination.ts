import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Paginación de listados (HT-AUTH-03 plan §13: `limite` máximo 100). */
export const LIMITE_MAXIMO = 100;
export const LIMITE_POR_DEFECTO = 20;

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITE_MAXIMO)
  limite?: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly pagina: number;
  readonly limite: number;
}

export function pageWindow(q: PaginationQuery): { pagina: number; limite: number; skip: number } {
  const pagina = q.pagina ?? 1;
  const limite = q.limite ?? LIMITE_POR_DEFECTO;
  return { pagina, limite, skip: (pagina - 1) * limite };
}
