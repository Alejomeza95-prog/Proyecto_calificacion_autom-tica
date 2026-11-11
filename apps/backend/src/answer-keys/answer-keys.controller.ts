import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Types } from 'mongoose';
import { CurrentPrincipal, OriginProtected, Roles } from '../authz/decorators';
import { ROLES_EDICION_CLAVES, ROLES_LECTURA_CLAVES } from '../authz/permissions';
import type { Principal } from '../authz/principal';
import { parseObjectIdOr404 } from '../common/http/object-id';
import type { Page } from '../common/pagination';
import { ActualizarClaveDto, CrearClaveDto, EliminarClaveQuery, ListarClavesQuery, PublicarClaveDto } from './answer-keys.dto';
import { AnswerKeysService, type ClaveRespuestaDto, type ClaveResumenDto } from './answer-keys.service';

/** Claves de respuesta (HT-AUTH-03 plan §8). Lectura: todos los roles; edición: ADMIN y COORDINADOR (DEC-06). */
@OriginProtected()
@Controller('claves-respuesta')
export class AnswerKeysController {
  constructor(private readonly service: AnswerKeysService) {}

  @Roles(...ROLES_LECTURA_CLAVES)
  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query() q: ListarClavesQuery): Promise<Page<ClaveResumenDto>> {
    return this.service.list(
      principal,
      {
        pruebaId: q.pruebaId ? new Types.ObjectId(q.pruebaId) : undefined,
        fecha: q.fecha,
        sesion: q.sesion,
        materia: q.materia,
        estado: q.estado,
      },
      { pagina: q.pagina, limite: q.limite },
    );
  }

  @Roles(...ROLES_LECTURA_CLAVES)
  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<ClaveRespuestaDto> {
    return this.service.get(principal, parseObjectIdOr404(id));
  }

  @Roles(...ROLES_EDICION_CLAVES)
  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CrearClaveDto): Promise<ClaveRespuestaDto> {
    return this.service.create(principal, {
      pruebaId: new Types.ObjectId(dto.pruebaId),
      fecha: dto.fecha,
      sesion: dto.sesion,
      materia: dto.materia,
      cantidadPreguntas: dto.cantidadPreguntas,
      respuestas: dto.respuestas,
    });
  }

  @Roles(...ROLES_EDICION_CLAVES)
  @Put(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: ActualizarClaveDto,
  ): Promise<ClaveRespuestaDto> {
    return this.service.update(principal, parseObjectIdOr404(id), dto);
  }

  @Roles(...ROLES_EDICION_CLAVES)
  @Post(':id/publicar')
  @HttpCode(200)
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: PublicarClaveDto,
  ): Promise<ClaveRespuestaDto> {
    return this.service.publish(principal, parseObjectIdOr404(id), dto.version);
  }

  @Roles(...ROLES_EDICION_CLAVES)
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query() q: EliminarClaveQuery,
  ): Promise<void> {
    await this.service.remove(principal, parseObjectIdOr404(id), q.version);
  }
}
