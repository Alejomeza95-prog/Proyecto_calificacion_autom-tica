import { queryString } from '../auth/api/http-client.ts';
import { ApiError, isRecord } from '../auth/api/problem.ts';
import type { ApiRequest } from '../auth/session/session-controller.ts';

/** Copia de los contratos de `apps/backend/src/admin-users` e `instituciones` (HT-AUTH-03 plan §8). */
export const APPROVABLE_ROLES = ['COORDINADOR', 'DOCENTE'] as const;
export type ApprovableRole = (typeof APPROVABLE_ROLES)[number];

export interface PendingAccount {
  readonly id: string;
  readonly nombre: string;
  readonly correo: string;
  readonly registradoEn: string;
}

export interface PendingPage {
  readonly items: readonly PendingAccount[];
  readonly total: number;
  readonly pagina: number;
  readonly limite: number;
}

export interface Institution {
  readonly id: string;
  readonly nombre: string;
}

const isString = (v: unknown): v is string => typeof v === 'string';

function toPending(value: unknown): PendingAccount {
  if (isRecord(value) && isString(value.id) && isString(value.nombre) && isString(value.correo) && isString(value.registradoEn)) {
    return { id: value.id, nombre: value.nombre, correo: value.correo, registradoEn: value.registradoEn };
  }
  throw new ApiError('desconocido');
}

export async function listPending(request: ApiRequest, pagina = 1): Promise<PendingPage> {
  const data = await request(`/admin/usuarios${queryString({ estado: 'PENDIENTE_APROBACION', pagina, limite: 50 })}`, {
    method: 'GET',
  });
  if (!isRecord(data) || !Array.isArray(data.items) || typeof data.total !== 'number') throw new ApiError('desconocido');
  return {
    items: data.items.map(toPending),
    total: data.total,
    pagina: typeof data.pagina === 'number' ? data.pagina : pagina,
    limite: typeof data.limite === 'number' ? data.limite : 50,
  };
}

export async function listInstitutions(request: ApiRequest): Promise<Institution[]> {
  const data = await request('/instituciones', { method: 'GET' });
  if (!Array.isArray(data)) throw new ApiError('desconocido');
  return data.map((v: unknown) => {
    if (isRecord(v) && isString(v.id) && isString(v.nombre)) return { id: v.id, nombre: v.nombre };
    throw new ApiError('desconocido');
  });
}

export async function approveAccount(
  request: ApiRequest,
  id: string,
  body: { readonly rol: ApprovableRole; readonly institucionId: string },
): Promise<void> {
  await request(`/admin/usuarios/${encodeURIComponent(id)}/aprobar`, { method: 'POST', body });
}
