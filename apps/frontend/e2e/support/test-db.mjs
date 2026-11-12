// Operaciones sobre las bases de la ejecución E2E en curso (plan §10, §15, DEC-14 y DEC-15). Es `.mjs` porque usa
// APIs de Node y el proyecto no tiene `@types/node`. Cualquier base que no sea de la ejecución en curso se rechaza
// (`e2e-run.mjs`), y cada operación usa el usuario propio de la base, con `readWrite` solo sobre ella: sin raíz.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { currentRunId, isRunDatabase, mongoEval, newActivationDatabase, runResources } from './e2e-run.mjs';
import { activationContainerId } from './isolated-backend.mjs';

const ISOLATED_BACKEND = fileURLToPath(new URL('./isolated-backend.mjs', import.meta.url));

/** @returns {number} documentos que coincidieron con el correo */
export function setAccountFields(correo, fields) {
  const runId = currentRunId();
  const script = `print(db.usuarios.updateOne({ correo_normalizado: ${JSON.stringify(correo)} }, { $set: ${JSON.stringify(fields)} }).matchedCount);`;
  return Number(mongoEval(runId, runResources(runId).database, script));
}

/**
 * Vence los tokens vigentes de la cuenta, para que el rechazo lo decida el backend real sin esperar su vigencia.
 * @returns {number} tokens vencidos
 */
export function expireTokens(correo, proposito, database) {
  const runId = currentRunId();
  const script = [
    `const u = db.usuarios.findOne({ correo_normalizado: ${JSON.stringify(correo)} });`,
    `print(db.tokens_seguridad.updateMany({ usuario_id: u._id, proposito: ${JSON.stringify(proposito)}, usado_en: null, invalidado_en: null }, { $set: { expira_en: new Date(Date.now() - 1000) } }).modifiedCount);`,
  ].join(' ');
  return Number(mongoEval(runId, database ?? runResources(runId).database, script));
}

/** Levanta el backend de activación con una base nueva de la ejecución y devuelve su nombre. */
export function startActivationBackend() {
  const runId = currentRunId();
  const database = newActivationDatabase(runId);
  execFileSync(process.execPath, [ISOLATED_BACKEND, 'activacion', runId, database], { stdio: 'ignore' });
  return database;
}

/**
 * Ejecuta el comando real `bootstrap:admin`, que envía el enlace de activación por correo. Corre dentro del backend de
 * activación de la ejecución (comprobado por ID), con su propio `MONGODB_URI`: el usuario de su base (DEC-15).
 * Sin shell (O-5): `docker exec` recibe `node`, el script y cada valor como argumentos separados, así que `$`, `$(...)`,
 * acentos graves, comillas o barras en el nombre o el correo llegan literales a la CLI.
 */
export function runBootstrapAdmin(database, nombre, correo) {
  const runId = currentRunId();
  if (!isRunDatabase(runId, database) || !database.startsWith(runResources(runId).activationDatabasePrefix)) {
    throw new Error('Solo se escribe en las bases de activación de la ejecución E2E en curso');
  }
  const args = ['exec', activationContainerId(runId), 'node', 'dist/cli/bootstrap-admin.js', '--nombre', nombre, '--correo', correo];
  execFileSync('docker', args, { stdio: 'ignore' });
}
