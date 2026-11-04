import { Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import { ProblemException, ProblemType } from '../common/http/problem';
import type { Principal } from './principal';
import { ROLE_SCOPE } from './role';

/** Filtro de alcance que se combina con el filtro de cada consulta a MongoDB. */
export type ScopeFilter = Readonly<Record<string, unknown>>;

/**
 * Alcance por institución (RN-17, DEC-14, plan §11).
 * - ADMIN: alcance global, sin filtro adicional.
 * - COORDINADOR y DOCENTE: solo su institución; sin institución → sin acceso (403).
 * - Un recurso fuera del alcance responde 404, igual que uno inexistente.
 * El filtro se aplica **en la propia consulta** (listados, búsquedas y actualizaciones), no solo aquí.
 */
@Injectable()
export class InstitutionScopePolicy {
  /** Filtro `{ institucion_id }` del principal, o `{}` para un rol global. */
  scopeFilter(principal: Principal): ScopeFilter {
    if (principal.rol === null) throw new ProblemException(403, ProblemType.ACCESO_DENEGADO);
    if (ROLE_SCOPE[principal.rol] === 'GLOBAL') return {};
    if (!principal.institucionId) throw new ProblemException(403, ProblemType.ACCESO_DENEGADO);
    return { institucion_id: principal.institucionId };
  }

  /**
   * Combina el filtro de la operación con el de alcance. Se usa `$and` para que el filtro de la
   * operación nunca pueda reemplazar la condición de institución.
   */
  scoped(principal: Principal, filter: Readonly<Record<string, unknown>>): Record<string, unknown> {
    const scope = this.scopeFilter(principal);
    return Object.keys(scope).length === 0 ? { ...filter } : { $and: [filter, scope] };
  }

  /** Comprueba un recurso ya leído; fuera del alcance → 404 (DEC-14). */
  assertInScope(principal: Principal, resourceInstitucionId: Types.ObjectId | null): void {
    const scope = this.scopeFilter(principal);
    if (Object.keys(scope).length === 0) return;
    if (!resourceInstitucionId || !principal.institucionId?.equals(resourceInstitucionId)) {
      throw new ProblemException(404, ProblemType.NO_ENCONTRADO);
    }
  }
}
