import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { AdminAuditService } from '../audit/admin-audit.service';
import { AdminEvent, RecursoTipo } from '../audit/admin-event';
import { InstitutionScopePolicy } from '../authz/institution-scope.policy';
import type { Principal } from '../authz/principal';
import { CLOCK, type Clock } from '../common/clock';
import { conflict, invalidField, notFound } from '../common/http/object-id';
import { ProblemException, ProblemType } from '../common/http/problem';
import { pageWindow, type Page, type PaginationQuery } from '../common/pagination';
import { Prueba } from '../pruebas/prueba.schema';
import { PruebasService } from '../pruebas/pruebas.service';
import { isDuplicateKey } from '../users/users.service';
import { EstadoClave, type Materia, type RespuestaClave, type Sesion } from './answer-key.constants';
import { missingQuestions } from './answer-key.rules';
import { ClaveRespuesta } from './clave-respuesta.schema';

export interface ClaveResumenDto {
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

export interface ClaveRespuestaDto extends ClaveResumenDto {
  readonly respuestas: RespuestaClave[];
}

export interface ClaveFilters {
  readonly pruebaId?: Types.ObjectId;
  readonly fecha?: string;
  readonly sesion?: Sesion;
  readonly materia?: Materia;
  readonly estado?: EstadoClave;
}

export interface ContenidoClave {
  readonly cantidadPreguntas: number;
  readonly respuestas: readonly RespuestaClave[];
}

type ClaveLean = ClaveRespuesta & { _id: Types.ObjectId };

/** `YYYY-MM-DD` → Date a 00:00 UTC; día inexistente → 400. */
export function parseDay(value: string, campo = 'fecha'): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalidField(campo, 'fechaValida');
  return date;
}

function assertLength(input: ContenidoClave): void {
  if (input.respuestas.length !== input.cantidadPreguntas) throw invalidField('respuestas', 'longitudIgualCantidad');
}

/**
 * CRUD de claves de respuesta (HT-AUTH-03 plan §2.3 y §5; RN-06..RN-14). Cada escritura es atómica sobre un
 * documento: unicidad por índice (RN-07), concurrencia optimista por `version` (RN-14, DEC-08) y estado
 * BORRADOR en el filtro (RN-11, RN-12). Toda consulta lleva el filtro de alcance (RN-13).
 */
@Injectable()
export class AnswerKeysService {
  constructor(
    @InjectModel(ClaveRespuesta.name) private readonly claves: Model<ClaveRespuesta>,
    @InjectModel(Prueba.name) private readonly pruebas: Model<Prueba>,
    private readonly pruebasService: PruebasService,
    private readonly scope: InstitutionScopePolicy,
    private readonly audit: AdminAuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** CA-06, CA-07, CA-08. */
  async create(
    principal: Principal,
    input: ContenidoClave & { pruebaId: Types.ObjectId; fecha: string; sesion: Sesion; materia: Materia },
  ): Promise<ClaveRespuestaDto> {
    assertLength(input);
    const fecha = parseDay(input.fecha);
    const prueba = await this.pruebasService.findInScope(principal, input.pruebaId);
    try {
      const created = await this.claves.create({
        institucion_id: new Types.ObjectId(prueba.institucionId),
        prueba_id: input.pruebaId,
        fecha,
        sesion: input.sesion,
        materia: input.materia,
        cantidad_preguntas: input.cantidadPreguntas,
        respuestas: [...input.respuestas],
        estado: EstadoClave.BORRADOR,
        creado_por: principal.id,
        actualizado_por: principal.id,
      });
      await this.record(AdminEvent.CLAVE_CREADA, principal, created, { cantidad_preguntas: created.cantidad_preguntas });
      return await this.get(principal, created._id);
    } catch (error) {
      if (isDuplicateKey(error, 'materia')) throw conflict();
      throw error;
    }
  }

  /** CA-11: listado dentro del alcance con filtros. */
  async list(principal: Principal, filters: ClaveFilters, page: PaginationQuery): Promise<Page<ClaveResumenDto>> {
    const { pagina, limite, skip } = pageWindow(page);
    const base: Record<string, unknown> = {};
    if (filters.pruebaId) base.prueba_id = filters.pruebaId;
    if (filters.fecha) base.fecha = parseDay(filters.fecha);
    if (filters.sesion) base.sesion = filters.sesion;
    if (filters.materia) base.materia = filters.materia;
    if (filters.estado) base.estado = filters.estado;
    const filter = this.scope.scoped(principal, base);
    const [docs, total] = await Promise.all([
      this.claves.find(filter).sort({ fecha: -1, materia: 1, _id: 1 }).skip(skip).limit(limite).lean<ClaveLean[]>().exec(),
      this.claves.countDocuments(filter).exec(),
    ]);
    const nombres = await this.pruebaNames(docs.map((d) => d.prueba_id));
    return {
      items: docs.map((d) => this.toResumen(d, nombres.get(d.prueba_id.toHexString()) ?? null)),
      total,
      pagina,
      limite,
    };
  }

  /** CA-11: una clave por id; fuera del alcance → 404. */
  async get(principal: Principal, id: Types.ObjectId): Promise<ClaveRespuestaDto> {
    const doc = await this.findScoped(principal, id);
    if (!doc) throw notFound();
    const nombres = await this.pruebaNames([doc.prueba_id]);
    return this.toDto(doc, nombres.get(doc.prueba_id.toHexString()) ?? null);
  }

  /** CA-09, RN-14: edita un BORRADOR con la versión vigente; PUBLICADA o versión vieja → 409 (RN-11). */
  async update(principal: Principal, id: Types.ObjectId, input: ContenidoClave & { version: number }): Promise<ClaveRespuestaDto> {
    assertLength(input);
    const result = await this.claves
      .updateOne(
        this.scope.scoped(principal, { _id: id, version: input.version, estado: EstadoClave.BORRADOR }),
        {
          $set: { cantidad_preguntas: input.cantidadPreguntas, respuestas: [...input.respuestas], actualizado_por: principal.id },
          $inc: { version: 1 },
        },
        { runValidators: true },
      )
      .exec();
    if (result.matchedCount === 0) throw await this.missOrConflict(principal, id);
    const doc = await this.requireScoped(principal, id);
    await this.record(AdminEvent.CLAVE_ACTUALIZADA, principal, doc, { cantidad_preguntas: doc.cantidad_preguntas });
    return this.get(principal, id);
  }

  /** CA-10, RN-10: publica un BORRADOR completo; incompleto → 422 con `preguntasFaltantes`. */
  async publish(principal: Principal, id: Types.ObjectId, version: number): Promise<ClaveRespuestaDto> {
    const current = await this.requireScoped(principal, id);
    if (current.estado !== EstadoClave.BORRADOR || current.version !== version) throw conflict();
    const faltantes = missingQuestions(current.respuestas);
    if (faltantes.length > 0) {
      throw new ProblemException(422, ProblemType.CLAVE_INCOMPLETA, undefined, { preguntasFaltantes: faltantes });
    }
    // La completitud también va en el filtro: si otra persona guardó en medio, no se publica (RN-14).
    const result = await this.claves
      .updateOne(
        this.scope.scoped(principal, {
          _id: id,
          version,
          estado: EstadoClave.BORRADOR,
          respuestas: { $nin: [null] },
        }),
        {
          $set: {
            estado: EstadoClave.PUBLICADA,
            publicada_en: this.clock.now(),
            publicada_por: principal.id,
            actualizado_por: principal.id,
          },
          $inc: { version: 1 },
        },
      )
      .exec();
    if (result.matchedCount === 0) throw conflict();
    await this.record(AdminEvent.CLAVE_PUBLICADA, principal, current, {
      estado_anterior: EstadoClave.BORRADOR,
      estado_nuevo: EstadoClave.PUBLICADA,
    });
    return this.get(principal, id);
  }

  /** CA-12, RN-12: elimina solo un BORRADOR con la versión vigente. */
  async remove(principal: Principal, id: Types.ObjectId, version: number): Promise<void> {
    const current = await this.findScoped(principal, id);
    if (!current) throw notFound();
    const result = await this.claves
      .deleteOne(this.scope.scoped(principal, { _id: id, version, estado: EstadoClave.BORRADOR }))
      .exec();
    if (result.deletedCount === 0) throw conflict();
    await this.record(AdminEvent.CLAVE_ELIMINADA, principal, current, { materia: current.materia });
  }

  private findScoped(principal: Principal, id: Types.ObjectId): Promise<ClaveLean | null> {
    return this.claves.findOne(this.scope.scoped(principal, { _id: id })).lean<ClaveLean>().exec();
  }

  private async requireScoped(principal: Principal, id: Types.ObjectId): Promise<ClaveLean> {
    const doc = await this.findScoped(principal, id);
    if (!doc) throw notFound();
    return doc;
  }

  private async missOrConflict(principal: Principal, id: Types.ObjectId): Promise<ProblemException> {
    return (await this.findScoped(principal, id)) ? conflict() : notFound();
  }

  private async pruebaNames(ids: readonly Types.ObjectId[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const docs = await this.pruebas.find({ _id: { $in: ids } }, { nombre: 1 }).lean().exec();
    return new Map(docs.map((p) => [p._id.toHexString(), p.nombre]));
  }

  private record(
    evento: AdminEvent,
    principal: Principal,
    doc: { _id: Types.ObjectId; institucion_id: Types.ObjectId },
    detalle: Record<string, string | number>,
  ): Promise<void> {
    return this.audit.record({
      evento,
      actorId: principal.id,
      recursoTipo: RecursoTipo.CLAVE_RESPUESTA,
      recursoId: doc._id,
      institucionId: doc.institucion_id,
      detalle,
    });
  }

  private toResumen(d: ClaveLean, pruebaNombre: string | null): ClaveResumenDto {
    return {
      id: d._id.toHexString(),
      pruebaId: d.prueba_id.toHexString(),
      pruebaNombre,
      institucionId: d.institucion_id.toHexString(),
      fecha: d.fecha.toISOString().slice(0, 10),
      sesion: d.sesion,
      materia: d.materia,
      cantidadPreguntas: d.cantidad_preguntas,
      respondidas: d.respuestas.filter((r) => r !== null).length,
      estado: d.estado,
      version: d.version,
      publicadaEn: d.publicada_en ? d.publicada_en.toISOString() : null,
      actualizadoEn: d.actualizado_en.toISOString(),
    };
  }

  private toDto(d: ClaveLean, pruebaNombre: string | null): ClaveRespuestaDto {
    return { ...this.toResumen(d, pruebaNombre), respuestas: [...d.respuestas] };
  }
}
