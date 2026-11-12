// Crea el entorno aislado de la ejecución (DEC-14 y DEC-15): RUN_ID y secreto nuevos, Redis temporal y backend con
// base y usuario de MongoDB propios. Las pruebas heredan `E2E_RUN_ID` y `E2E_RUN_SECRET` de este proceso; el secreto
// solo sirve para derivar las contraseñas de los usuarios de la ejecución y nunca se imprime.
// Si el arranque falla, se limpia lo creado (salvo E2E_KEEP=1).
// Propiedad (O-4b): el RUN_ID generado aquí se anota en `globalThis` del proceso de Playwright, no en el entorno, así que
// no se hereda ni se puede fijar desde fuera. `global-teardown.mjs` solo limpia si esa marca coincide con `E2E_RUN_ID`.
import { newRunId, newRunSecret } from './e2e-run.mjs';
import { down, up } from './isolated-backend.mjs';

/** Clave compartida con `global-teardown.mjs`. */
const RUN_OWNER = Symbol.for('omr.e2e.run-owner');

export default async function globalSetup() {
  // Una marca anterior del mismo proceso nunca vale para esta ejecución.
  delete globalThis[RUN_OWNER];
  if (process.env.E2E_RUN_ID || process.env.E2E_RUN_SECRET) {
    throw new Error('E2E_RUN_ID o E2E_RUN_SECRET ya están definidos: cada ejecución crea los suyos');
  }
  const runId = newRunId();
  process.env.E2E_RUN_ID = runId;
  process.env.E2E_RUN_SECRET = newRunSecret();
  globalThis[RUN_OWNER] = runId;
  console.log(`E2E RUN_ID=${runId}`);
  try {
    await up(runId);
  } catch (error) {
    if (process.env.E2E_KEEP === '1') {
      console.log(`E2E_KEEP=1: se conservan los recursos de ${runId}. Limpiar: node e2e/support/isolated-backend.mjs down ${runId}`);
    } else {
      try {
        down(runId);
      } catch (cleanupError) {
        // Se informa, pero se relanza el error del arranque, que es la causa.
        console.error(cleanupError instanceof Error ? cleanupError.message : cleanupError);
      }
    }
    throw error;
  }
}
