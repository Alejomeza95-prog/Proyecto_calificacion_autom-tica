/** Propósitos de los tokens de seguridad (plan §3.2). */
export const TokenPurpose = {
  VERIFICAR_CORREO: 'VERIFICAR_CORREO',
  RESTABLECER_PASSWORD: 'RESTABLECER_PASSWORD',
  ACTIVAR_CUENTA: 'ACTIVAR_CUENTA',
} as const;
export type TokenPurpose = (typeof TokenPurpose)[keyof typeof TokenPurpose];
export const TOKEN_PURPOSES: readonly TokenPurpose[] = Object.values(TokenPurpose);
