import type { Types } from 'mongoose';
import type { Role } from '../authz/role';

/** Rol e institución que asigna una invitación validada **en el servidor** (DEC-07, RN-02). */
export interface InvitationAssignment {
  readonly rol: Role;
  readonly institucionId: Types.ObjectId | null;
}

/**
 * Puerto de invitaciones (spec §3: «si una invitación validada existe, el rol y la institución provienen
 * del servidor»). La creación, el envío y el almacén de invitaciones son de una historia posterior
 * (spec §3 fuera de alcance; plan §10, DT-09): esta historia solo define cómo el registro las usa.
 * - `find` devuelve la asignación solo si el código es válido **para ese correo normalizado**.
 * - `markUsed` la marca usada después de crear la cuenta.
 */
export interface InvitationResolver {
  find(code: string, correoNormalizado: string): Promise<InvitationAssignment | null>;
  markUsed(code: string, usuarioId: Types.ObjectId): Promise<void>;
}

export const INVITATION_RESOLVER = Symbol('INVITATION_RESOLVER');

/**
 * Adaptador por defecto mientras no exista el almacén de invitaciones: ninguna invitación es válida y el
 * registro sigue como autorregistro (sin rol ni institución). Nunca concede permisos.
 */
export class NoInvitationResolver implements InvitationResolver {
  find(): Promise<null> {
    return Promise.resolve(null);
  }
  markUsed(): Promise<void> {
    return Promise.resolve();
  }
}
