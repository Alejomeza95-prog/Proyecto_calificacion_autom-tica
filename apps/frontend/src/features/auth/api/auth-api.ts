import { send, sendProtected, type AccessTokenSource } from './http-client.ts';
import { ApiError, isRecord } from './problem.ts';
import {
  ACCOUNT_STATUSES,
  ROLES,
  type AccessTokenResponse,
  type AccountStatus,
  type GenericMessage,
  type LoginRequest,
  type MeResponse,
  type RegisterRequest,
  type Role,
  type TokenPasswordRequest,
  type VerifyEmailResponse,
} from './types.ts';

function isAccountStatus(value: unknown): value is AccountStatus {
  return ACCOUNT_STATUSES.some((status) => status === value);
}

function isRole(value: unknown): value is Role {
  return ROLES.some((role) => role === value);
}

function isAccessTokenResponse(value: unknown): value is AccessTokenResponse {
  return isRecord(value) && typeof value.accessToken === 'string' && typeof value.expiresIn === 'number';
}

function isMeResponse(value: unknown): value is MeResponse {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.nombre === 'string' &&
    (value.rol === null || isRole(value.rol)) &&
    (value.institucionId === null || typeof value.institucionId === 'string') &&
    isAccountStatus(value.estado)
  );
}

function isGenericMessage(value: unknown): value is GenericMessage {
  return isRecord(value) && typeof value.mensaje === 'string';
}

function isVerifyEmailResponse(value: unknown): value is VerifyEmailResponse {
  return isRecord(value) && isAccountStatus(value.estado);
}

/** Una respuesta satisfactoria fuera del contrato se trata como `desconocido`, sin conservar su contenido. */
function expectShape<T>(value: unknown, guard: (candidate: unknown) => candidate is T): T {
  if (!guard(value)) throw new ApiError('desconocido');
  return value;
}

// Los cuerpos se construyen campo a campo: un dato de más nunca llega a la API (RN-04).

export async function register({ nombre, correo, password }: RegisterRequest): Promise<GenericMessage> {
  const data = await send('/register', { method: 'POST', body: { nombre, correo, password } });
  return expectShape(data, isGenericMessage);
}

export async function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  const data = await send('/verify-email', { method: 'POST', body: { token } });
  return expectShape(data, isVerifyEmailResponse);
}

export async function resendVerification(correo: string): Promise<GenericMessage> {
  const data = await send('/resend-verification', { method: 'POST', body: { correo } });
  return expectShape(data, isGenericMessage);
}

export async function login({ correo, password, captchaToken }: LoginRequest): Promise<AccessTokenResponse> {
  const body = { correo, password, ...(captchaToken === undefined ? {} : { captchaToken }) };
  const data = await send('/login', { method: 'POST', body });
  return expectShape(data, isAccessTokenResponse);
}

export async function refresh(): Promise<AccessTokenResponse> {
  const data = await send('/refresh', { method: 'POST' });
  return expectShape(data, isAccessTokenResponse);
}

export async function getMe(tokens: AccessTokenSource): Promise<MeResponse> {
  const data = await sendProtected('/me', { method: 'GET' }, tokens);
  return expectShape(data, isMeResponse);
}

export async function logout(tokens: AccessTokenSource): Promise<void> {
  await sendProtected('/logout', { method: 'POST' }, tokens);
}

export async function forgotPassword(correo: string): Promise<GenericMessage> {
  const data = await send('/password/forgot', { method: 'POST', body: { correo } });
  return expectShape(data, isGenericMessage);
}

export async function resetPassword({ token, password }: TokenPasswordRequest): Promise<void> {
  await send('/password/reset', { method: 'POST', body: { token, password } });
}

export async function activateAccount({ token, password }: TokenPasswordRequest): Promise<void> {
  await send('/activate', { method: 'POST', body: { token, password } });
}
