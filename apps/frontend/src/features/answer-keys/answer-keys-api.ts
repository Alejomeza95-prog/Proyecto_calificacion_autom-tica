import { queryString } from '../auth/api/http-client.ts';
import { ApiError, isRecord } from '../auth/api/problem.ts';
import type { ApiRequest } from '../auth/session/session-controller.ts';

/** Copia de `apps/backend/src/answer-keys/answer-key.constants.ts` (HT-AUTH-03 RN-06, RN-08, RN-09, RN-10). */
export const MATERIAS = ['MAT', 'CN', 'CC', 'LC', 'ING'] as const;
export type Materia = (typeof MATERIAS)[number];
export const MATERIA_LABELS: Readonly<Record<Materia, string>> = {
  MAT: 'Matemáticas',
  CN: 'Ciencias Naturales',
  CC: 'Competencias Ciudadanas',
  LC: 'Lectura Crítica',
  ING: 'Inglés',
};

export const OPCIONES_CLAVE = ['A', 'B', 'C', 'D'] as const;
export type OpcionClave = (typeof OPCIONES_CLAVE)[number];
export type RespuestaClave = OpcionClave | null;

export const SESIONES = ['SESION_1', 'SESION_2'] as const;
export type Sesion = (typeof SESIONES)[number];
export const SESION_LABELS: Readonly<Record<Sesion, string>> = { SESION_1: 'Sesión 1', SESION_2: 'Sesión 2' };

export const MIN_PREGUNTAS = 1;
export const MAX_PREGUNTAS = 100;

export const ESTADOS_CLAVE = ['BORRADOR', 'PUBLICADA'] as const;
export type EstadoClave = (typeof ESTADOS_CLAVE)[number];
export const ESTADO_LABELS: Readonly<Record<EstadoClave, string>> = { BORRADOR: 'Borrador', PUBLICADA: 'Publicada' };

export interface Prueba {
  readonly id: string;
  readonly nombre: string;
  readonly institucionId: string;
}

export interface ClaveResumen {
  readonly id: string;
  readonly pruebaId: string;
  readonly pruebaNombre: string | null;
  readonly institucionId: string;
  readonly fecha: string;
  readonly sesion: Sesion;
  readonly materia: Materia;
  readonly cantidadPreguntas: number;
  readonly respondidas: number;
  readonly estado: EstadoClave;
  readonly version: number;
  readonly publicadaEn: string | null;
  readonly actualizadoEn: string;
}

export interface Clave extends ClaveResumen {
  readonly respuestas: readonly RespuestaClave[];
}

export interface ClavePage {
  readonly items: readonly ClaveResumen[];
  readonly total: number;
}

export interface ClaveFilters {
  readonly pruebaId?: string;
  readonly fecha?: string;
  readonly sesion?: Sesion;
  readonly materia?: Materia;
  readonly estado?: EstadoClave;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

function toPrueba(v: unknown): Prueba {
  if (isRecord(v) && isString(v.id) && isString(v.nombre) && isString(v.institucionId)) {
    return { id: v.id, nombre: v.nombre, institucionId: v.institucionId };
  }
  throw new ApiError('desconocido');
}

function toResumen(v: unknown): ClaveResumen {
  if (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.pruebaId) &&
    (v.pruebaNombre === null || isString(v.pruebaNombre)) &&
    isString(v.institucionId) &&
    isString(v.fecha) &&
    isIn(SESIONES, v.sesion) &&
    isIn(MATERIAS, v.materia) &&
    typeof v.cantidadPreguntas === 'number' &&
    typeof v.respondidas === 'number' &&
    isIn(ESTADOS_CLAVE, v.estado) &&
    typeof v.version === 'number' &&
    (v.publicadaEn === null || isString(v.publicadaEn)) &&
    isString(v.actualizadoEn)
  ) {
    return {
      id: v.id,
      pruebaId: v.pruebaId,
      pruebaNombre: v.pruebaNombre,
      institucionId: v.institucionId,
      fecha: v.fecha,
      sesion: v.sesion,
      materia: v.materia,
      cantidadPreguntas: v.cantidadPreguntas,
      respondidas: v.respondidas,
      estado: v.estado,
      version: v.version,
      publicadaEn: v.publicadaEn,
      actualizadoEn: v.actualizadoEn,
    };
  }
  throw new ApiError('desconocido');
}

function toClave(v: unknown): Clave {
  const resumen = toResumen(v);
  if (isRecord(v) && Array.isArray(v.respuestas) && v.respuestas.every((r) => r === null || isIn(OPCIONES_CLAVE, r))) {
    return { ...resumen, respuestas: v.respuestas as RespuestaClave[] };
  }
  throw new ApiError('desconocido');
}

export async function listPruebas(request: ApiRequest): Promise<Prueba[]> {
  const data = await request('/pruebas', { method: 'GET' });
  if (!Array.isArray(data)) throw new ApiError('desconocido');
  return data.map(toPrueba);
}

/**
 * Alta de prueba (DEC-04). El ADMIN tiene alcance global y debe indicar `institucionId` (plan §3.3); un rol
 * institucional lo omite y el backend usa su institución.
 */
export async function createPrueba(request: ApiRequest, nombre: string, institucionId?: string): Promise<Prueba> {
  const body = institucionId === undefined ? { nombre } : { nombre, institucionId };
  return toPrueba(await request('/pruebas', { method: 'POST', body }));
}

export async function listClaves(request: ApiRequest, filters: ClaveFilters, limite = 100): Promise<ClavePage> {
  const data = await request(`/claves-respuesta${queryString({ ...filters, limite })}`, { method: 'GET' });
  if (!isRecord(data) || !Array.isArray(data.items) || typeof data.total !== 'number') throw new ApiError('desconocido');
  return { items: data.items.map(toResumen), total: data.total };
}

export async function getClave(request: ApiRequest, id: string): Promise<Clave> {
  return toClave(await request(`/claves-respuesta/${encodeURIComponent(id)}`, { method: 'GET' }));
}

export async function createClave(
  request: ApiRequest,
  body: {
    readonly pruebaId: string;
    readonly fecha: string;
    readonly sesion: Sesion;
    readonly materia: Materia;
    readonly cantidadPreguntas: number;
    readonly respuestas: readonly RespuestaClave[];
  },
): Promise<Clave> {
  return toClave(await request('/claves-respuesta', { method: 'POST', body }));
}

export async function updateClave(
  request: ApiRequest,
  id: string,
  body: { readonly version: number; readonly cantidadPreguntas: number; readonly respuestas: readonly RespuestaClave[] },
): Promise<Clave> {
  return toClave(await request(`/claves-respuesta/${encodeURIComponent(id)}`, { method: 'PUT', body }));
}

export async function publishClave(request: ApiRequest, id: string, version: number): Promise<Clave> {
  return toClave(await request(`/claves-respuesta/${encodeURIComponent(id)}/publicar`, { method: 'POST', body: { version } }));
}

export async function deleteClave(request: ApiRequest, id: string, version: number): Promise<void> {
  await request(`/claves-respuesta/${encodeURIComponent(id)}${queryString({ version })}`, { method: 'DELETE' });
}
