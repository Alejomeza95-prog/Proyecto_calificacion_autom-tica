export function setAccountFields(correo: string, fields: Readonly<Record<string, unknown>>): number;
export function expireTokens(correo: string, proposito: 'RESTABLECER_PASSWORD' | 'ACTIVAR_CUENTA', database?: string): number;
export function startActivationBackend(): string;
export function runBootstrapAdmin(database: string, nombre: string, correo: string): void;
