import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Types } from 'mongoose';
import { CurrentPrincipal, OriginProtected, Roles } from '../authz/decorators';
import { ROLES_EDICION_CLAVES, ROLES_LECTURA_CLAVES } from '../authz/permissions';
import type { Principal } from '../authz/principal';
import { PruebasService, type PruebaDto } from './pruebas.service';

export class ListarPruebasQuery {
  @IsOptional()
  @IsMongoId()
  institucionId?: string;
}

export class CrearPruebaDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsMongoId()
  institucionId?: string;
}

/** Pruebas (HT-AUTH-03 plan §8): lectura para todos los roles, alta para ADMIN y COORDINADOR (DEC-06). */
@OriginProtected()
@Controller('pruebas')
export class PruebasController {
  constructor(private readonly service: PruebasService) {}

  @Roles(...ROLES_LECTURA_CLAVES)
  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query() query: ListarPruebasQuery): Promise<PruebaDto[]> {
    return this.service.list(principal, query.institucionId ? new Types.ObjectId(query.institucionId) : undefined);
  }

  @Roles(...ROLES_EDICION_CLAVES)
  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() dto: CrearPruebaDto): Promise<PruebaDto> {
    return this.service.create(principal, {
      nombre: dto.nombre,
      institucionId: dto.institucionId ? new Types.ObjectId(dto.institucionId) : undefined,
    });
  }
}
