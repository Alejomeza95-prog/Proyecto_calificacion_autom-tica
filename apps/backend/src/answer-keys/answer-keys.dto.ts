import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsMongoId, IsOptional, Matches, Max, Min } from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import {
  ESTADOS_CLAVE,
  MATERIAS,
  MAX_PREGUNTAS,
  MIN_PREGUNTAS,
  OPCIONES_CLAVE,
  SESIONES,
  type EstadoClave,
  type Materia,
  type RespuestaClave,
  type Sesion,
} from './answer-key.constants';

/** Día en formato `YYYY-MM-DD` (la validez del calendario se comprueba en el servicio). */
export const FECHA_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RESPUESTAS_VALIDAS: readonly (RespuestaClave)[] = [...OPCIONES_CLAVE, null];

/** Contenido editable de una clave: cantidad y respuestas (RN-08, RN-09). */
class ContenidoClaveDto {
  @IsInt()
  @Min(MIN_PREGUNTAS)
  @Max(MAX_PREGUNTAS)
  cantidadPreguntas!: number;

  @IsArray()
  @ArrayMaxSize(MAX_PREGUNTAS)
  @IsIn(RESPUESTAS_VALIDAS, { each: true })
  respuestas!: RespuestaClave[];
}

/** `POST /claves-respuesta` (plan §9.1). */
export class CrearClaveDto extends ContenidoClaveDto {
  @IsMongoId()
  pruebaId!: string;

  @Matches(FECHA_PATTERN)
  fecha!: string;

  @IsIn(SESIONES)
  sesion!: Sesion;

  @IsIn(MATERIAS)
  materia!: Materia;
}

/** `PUT /claves-respuesta/:id`: prueba, fecha, sesión y materia no cambian (RN-07). */
export class ActualizarClaveDto extends ContenidoClaveDto {
  @IsInt()
  @Min(0)
  version!: number;
}

/** `POST /claves-respuesta/:id/publicar`. */
export class PublicarClaveDto {
  @IsInt()
  @Min(0)
  version!: number;
}

/** `DELETE /claves-respuesta/:id?version=`. */
export class EliminarClaveQuery {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

/** `GET /claves-respuesta` (CA-11). */
export class ListarClavesQuery extends PaginationQuery {
  @IsOptional()
  @IsMongoId()
  pruebaId?: string;

  @IsOptional()
  @Matches(FECHA_PATTERN)
  fecha?: string;

  @IsOptional()
  @IsIn(SESIONES)
  sesion?: Sesion;

  @IsOptional()
  @IsIn(MATERIAS)
  materia?: Materia;

  @IsOptional()
  @IsIn(ESTADOS_CLAVE)
  estado?: EstadoClave;
}
