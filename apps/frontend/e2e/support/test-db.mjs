// Operaciones sobre los entornos aislados (plan §10 y §15). Es `.mjs` porque usa APIs de Node y el proyecto no tiene
// `@types/node`. Las credenciales se expanden dentro de los contenedores: no pasan por este proceso.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MONGO_CONTAINER = 'omr-preicfes-mongo-1';
const E2E_DATABASE = 'omr_preicfes_e2e';
/** Solo las bases aisladas: ninguna escritura de las pruebas llega a la de desarrollo. */
const ISOLATED_DATABASE = /^omr_preicfes_e2e(_activacion_\d+)?$/;
const ACTIVATION_CONTAINER = 'omr-e2e-backend-activacion';
const ISOLATED_BACKEND = fileURLToPath(new URL('./isolated-backend.mjs', import.meta.url));

function mongoEval(database, script) {
  if (!ISOLATED_DATABASE.test(database)) throw new Error('Solo se escribe en las bases aisladas de las pruebas');
  const command = `mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin ${database} --eval '${script}'`;
  return execFileSync('docker', ['exec', MONGO_CONTAINER, 'sh', '-c', command], { encoding: 'utf8' }).trim();
}

/** @returns {number} documentos que coincidieron con el correo */
export function setAccountFields(correo, fields) {
  const script = `print(db.usuarios.updateOne({ correo_normalizado: ${JSON.stringify(correo)} }, { $set: ${JSON.stringify(fields)} }).matchedCount);`;
  return Number(mongoEval(E2E_DATABASE, script));
}

/**
 * Vence los tokens vigentes de la cuenta, para que el rechazo lo decida el backend real sin esperar su vigencia.
 * @returns {number} tokens vencidos
 */
export function expireTokens(correo, proposito, database = E2E_DATABASE) {
  const script = [
    `const u = db.usuarios.findOne({ correo_normalizado: ${JSON.stringify(correo)} });`,
    `print(db.tokens_seguridad.updateMany({ usuario_id: u._id, proposito: ${JSON.stringify(proposito)}, usado_en: null, invalidado_en: null }, { $set: { expira_en: new Date(Date.now() - 1000) } }).modifiedCount);`,
  ].join(' ');
  return Number(mongoEval(database, script));
}

/** Levanta el backend de activación con una base nueva y devuelve su nombre. */
export function startActivationBackend() {
  const database = `omr_preicfes_e2e_activacion_${Date.now()}`;
  execFileSync(process.execPath, [ISOLATED_BACKEND, 'activacion', database], { stdio: 'ignore' });
  return database;
}

/** Ejecuta el comando real `bootstrap:admin`, que envía el enlace de activación por correo. */
export function runBootstrapAdmin(database, nombre, correo) {
  if (!ISOLATED_DATABASE.test(database)) throw new Error('Solo se escribe en las bases aisladas de las pruebas');
  const command = [
    `export MONGODB_URI="mongodb://\${MONGO_ROOT_USER}:\${MONGO_ROOT_PASSWORD_URLENCODED}@mongo:27017/${database}?authSource=admin"`,
    `node dist/cli/bootstrap-admin.js --nombre ${JSON.stringify(nombre)} --correo ${JSON.stringify(correo)}`,
  ].join(' && ');
  execFileSync('docker', ['exec', ACTIVATION_CONTAINER, 'sh', '-c', command], { stdio: 'ignore' });
}
