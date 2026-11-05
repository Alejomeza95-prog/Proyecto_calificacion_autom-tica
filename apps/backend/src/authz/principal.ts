import type { Types } from 'mongoose';
import type { HttpRequest } from '../common/http/http-types';
import type { AccountStatus } from '../users/account-status';
import type { Role } from './role';

/**
 * Principal de la solicitud (plan §11, DEC-11): rol, institución, estado y versión se leen del
 * documento `usuarios` en cada solicitud, no de los claims del JWT.
 */
export interface Principal {
  readonly id: Types.ObjectId;
  readonly sid: Types.ObjectId;
  readonly nombre: string;
  readonly rol: Role | null;
  readonly institucionId: Types.ObjectId | null;
  readonly estado: AccountStatus;
}

export interface AuthenticatedRequest extends HttpRequest {
  principal?: Principal;
}
