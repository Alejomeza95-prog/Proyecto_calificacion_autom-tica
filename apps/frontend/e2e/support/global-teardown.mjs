// Limpia solo los recursos de la ejecución (DEC-14), también si hubo pruebas fallidas. Con E2E_KEEP=1 los conserva
// para depurar e indica cómo limpiarlos después.
// Propiedad (O-4b): Playwright 1.64.1 ejecuta este teardown aunque falle `global-setup.mjs` (comportamiento de su
// implementación, no documentado). Por eso un `E2E_RUN_ID` heredado no basta: solo se limpia si `global-setup.mjs` de
// este mismo proceso generó ese RUN_ID (marca en `globalThis`, que no se hereda del entorno).
import { assertRunId } from './e2e-run.mjs';
import { down } from './isolated-backend.mjs';

/** Clave compartida con `global-setup.mjs`. */
const RUN_OWNER = Symbol.for('omr.e2e.run-owner');

export default function globalTeardown() {
  const runId = process.env.E2E_RUN_ID;
  const owner = globalThis[RUN_OWNER];
  if (!runId) return;
  if (typeof owner !== 'string' || owner !== runId) {
    console.log(`E2E_RUN_ID=${runId} no lo creó esta ejecución: no se limpia nada.`);
    return;
  }
  assertRunId(runId);
  delete globalThis[RUN_OWNER];
  if (process.env.E2E_KEEP === '1') {
    console.log(`E2E_KEEP=1: se conservan los recursos de ${runId}. Limpiar: node e2e/support/isolated-backend.mjs down ${runId}`);
    return;
  }
  down(runId);
}
