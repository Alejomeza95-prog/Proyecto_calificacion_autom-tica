import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import { AccountStatus } from '../users/account-status';
import { APPROVABLE_ROLES, type ApprovableRole } from './admin-users.service';

/** `GET /admin/usuarios` (plan §8): solo admite el filtro de pendientes. */
export class ListarUsuariosQuery extends PaginationQuery {
  @IsOptional()
  @IsIn([AccountStatus.PENDIENTE_APROBACION])
  estado?: typeof AccountStatus.PENDIENTE_APROBACION;
}

/** `POST /admin/usuarios/:id/aprobar` (plan §9.1, RN-03). */
export class AprobarCuentaDto {
  @IsIn(APPROVABLE_ROLES)
  rol!: ApprovableRole;

  @IsMongoId()
  institucionId!: string;
}
