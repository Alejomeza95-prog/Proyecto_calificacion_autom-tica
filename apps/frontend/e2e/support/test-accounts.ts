import { request } from '@playwright/test';
import { APP_ORIGIN, uniqueEmail } from './env.ts';
import { setAccountFields } from './test-db.mjs';

/**
 * Prepara cuentas para las pruebas (plan §10 y §15): la aprobación aún no existe en la interfaz, así que el paso a
 * ACTIVA se escribe en la base aislada de la ejecución (DEC-14).
 */

/** Solo para cuentas `@example.test` de la base aislada. */
export const TEST_PASSWORD = 'clave-de-prueba-e2e-larga';
export const TEST_NAME = 'Persona de prueba';

type AccountChanges = {
  readonly estado?: 'ACTIVA' | 'PENDIENTE_APROBACION' | 'BLOQUEADA' | 'DESACTIVADA';
  readonly rol?: 'ADMIN' | null;
};

export function updateAccount(correo: string, changes: AccountChanges): void {
  if (setAccountFields(correo, changes) !== 1) throw new Error('La cuenta de prueba no existe en la base aislada');
}

/** Registra la cuenta por la API real, sin verificar. */
export async function registerAccount(prefix: string): Promise<string> {
  const correo = uniqueEmail(prefix);
  const api = await request.newContext({ baseURL: APP_ORIGIN, extraHTTPHeaders: { Origin: APP_ORIGIN } });
  const response = await api.post('/api/v1/auth/register', {
    data: { nombre: TEST_NAME, correo, password: TEST_PASSWORD },
  });
  await api.dispose();
  if (response.status() !== 202) throw new Error(`Registro de prueba rechazado: ${response.status()}`);
  return correo;
}

export async function createActiveAccount(prefix: string): Promise<string> {
  const correo = await registerAccount(prefix);
  updateAccount(correo, { estado: 'ACTIVA', rol: 'ADMIN' });
  return correo;
}
