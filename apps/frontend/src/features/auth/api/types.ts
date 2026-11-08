/** Copia de los contratos de `apps/backend/src/auth` (plan §9.1, DEC-07); la verifican los E2E contra el backend real. */

export const ACCOUNT_STATUSES = [
  'PENDIENTE_VERIFICACION',
  'PENDIENTE_APROBACION',
  'ACTIVA',
  'BLOQUEADA',
  'DESACTIVADA',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ROLES = ['ADMIN', 'COORDINADOR', 'DOCENTE'] as const;
export type Role = (typeof ROLES)[number];

export interface AccessTokenResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
}

export interface MeResponse {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Role | null;
  readonly institucionId: string | null;
  readonly estado: AccountStatus;
}

export interface GenericMessage {
  readonly mensaje: string;
}

export interface VerifyEmailResponse {
  readonly estado: AccountStatus;
}

export interface RegisterRequest {
  readonly nombre: string;
  readonly correo: string;
  readonly password: string;
}

export interface LoginRequest {
  readonly correo: string;
  readonly password: string;
  readonly captchaToken?: string;
}

export interface TokenPasswordRequest {
  readonly token: string;
  readonly password: string;
}
