import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Types } from 'mongoose';
import { CurrentPrincipal, OriginProtected, Roles } from '../authz/decorators';
import type { Principal } from '../authz/principal';
import { Role } from '../authz/role';
import { parseObjectIdOr404 } from '../common/http/object-id';
import type { Page } from '../common/pagination';
import { AprobarCuentaDto, ListarUsuariosQuery } from './admin-users.dto';
import { AdminUsersService, type ApprovedAccount, type PendingAccount } from './admin-users.service';

/** Panel de usuarios (HT-AUTH-03 plan §8). Solo ADMIN (RN-01); escrituras con `Origin` permitido. */
@OriginProtected()
@Roles(Role.ADMIN)
@Controller('admin/usuarios')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get()
  list(@Query() query: ListarUsuariosQuery): Promise<Page<PendingAccount>> {
    return this.service.listPending(query);
  }

  @Post(':id/aprobar')
  @HttpCode(200)
  approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: AprobarCuentaDto,
  ): Promise<ApprovedAccount> {
    return this.service.approve(principal, parseObjectIdOr404(id), {
      rol: dto.rol,
      institucionId: new Types.ObjectId(dto.institucionId),
    });
  }
}
