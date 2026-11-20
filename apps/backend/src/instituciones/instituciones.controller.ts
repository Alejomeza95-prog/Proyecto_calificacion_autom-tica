import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Roles } from '../authz/decorators';
import { Role } from '../authz/role';
import { Institucion } from './institucion.schema';

export interface InstitucionDto {
  readonly id: string;
  readonly nombre: string;
}

/** Catálogo de instituciones de solo lectura para el ADMIN (HT-AUTH-03 plan §8, DEC-03, CA-02). */
@Roles(Role.ADMIN)
@Controller('instituciones')
export class InstitucionesController {
  constructor(@InjectModel(Institucion.name) private readonly instituciones: Model<Institucion>) {}

  @Get()
  async list(): Promise<InstitucionDto[]> {
    const docs = await this.instituciones
      .find({ activa: true }, { nombre: 1 })
      .collation({ locale: 'es', strength: 2 })
      .sort({ nombre: 1 })
      .lean()
      .exec();
    return docs.map((d) => ({ id: d._id.toHexString(), nombre: d.nombre }));
  }
}
