import type { GenericMessage } from '../api/types.ts';

/**
 * Datos de «Revisa tu correo». Solo en memoria, ni en `history.state` ni en almacenes (plan §9.1):
 * al recargar se pierden y la pantalla ofrece Reenviar verificación.
 */
interface PendingVerification extends GenericMessage {
  readonly correo: string;
}

let pending: PendingVerification | null = null;

export function rememberPendingVerification(value: PendingVerification): void {
  pending = value;
}

export function getPendingVerification(): PendingVerification | null {
  return pending;
}

export function forgetPendingVerification(): void {
  pending = null;
}
