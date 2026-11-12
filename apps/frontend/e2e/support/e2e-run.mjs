// Identidad y límites de una ejecución E2E (HT-AUTH-02 DEC-14 y DEC-15). Todo recurso que crea una ejecución lleva
// su RUN_ID en el nombre o en la etiqueta `omr.e2e.run`, y solo esos recursos se escriben o se limpian.
// DEC-15: cada base de la ejecución tiene su propio usuario de MongoDB (`u_<base>`, rol `readWrite` solo sobre ella).
// La cuenta raíz del contenedor `mongo` se usa únicamente para crear y borrar esos usuarios y bases, y para listados de
// solo lectura. Las contraseñas se derivan del secreto de la ejecución y viajan por variables de entorno, nunca como
// argumentos. Es `.mjs` porque usa APIs de Node y el proyecto no tiene `@types/node`.
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';

/** `AAAAMMDDhhmmss_xxxxxx`: fecha UTC y 6 hexadecimales aleatorios. Válido como nombre de base y de contenedor. */
export const RUN_ID_PATTERN = /^\d{14}_[0-9a-f]{6}$/;
const RUN_SECRET_PATTERN = /^[0-9a-f]{64}$/;
export const RUN_LABEL = 'omr.e2e.run';
export const ROLE_LABEL = 'omr.e2e.role';
/** MongoDB y la red de Compose de desarrollo: se usan, pero solo se escriben bases y usuarios de la ejecución. */
export const MONGO_CONTAINER = 'omr-preicfes-mongo-1';
export const NETWORK = 'omr-preicfes_omr';
/** Variable con la que la contraseña llega a mongosh dentro del contenedor (`docker exec -e`), sin pasar por argumentos. */
const PASSWORD_ENV = 'E2E_DB_PASSWORD';

export function newRunId() {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `${stamp}_${randomBytes(3).toString('hex')}`;
}

export function newRunSecret() {
  return randomBytes(32).toString('hex');
}

export function assertRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) throw new Error('RUN_ID de E2E no válido');
  return runId;
}

/** RUN_ID de la ejecución en curso: lo fija `global-setup.mjs` y lo heredan los procesos de las pruebas. */
export function currentRunId() {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) throw new Error('Falta E2E_RUN_ID: ejecuta las pruebas con `pnpm test:e2e`, que crea el entorno aislado');
  return assertRunId(runId);
}

/** Secreto de la ejecución (DEC-15): lo fija `global-setup.mjs` junto con el RUN_ID. Nunca se imprime. */
function runSecret() {
  const secret = process.env.E2E_RUN_SECRET;
  if (typeof secret !== 'string' || !RUN_SECRET_PATTERN.test(secret)) {
    throw new Error('Falta E2E_RUN_SECRET válido: ejecuta las pruebas con `pnpm test:e2e`, que crea el entorno aislado');
  }
  return secret;
}

/** Nombres de los recursos de una ejecución. */
export function runResources(runId) {
  assertRunId(runId);
  return {
    redis: `omr-e2e-${runId}-redis`,
    backend: `omr-e2e-${runId}-backend`,
    activation: `omr-e2e-${runId}-backend-act`,
    database: `omr_test_e2e_${runId}`,
    activationDatabasePrefix: `omr_test_e2e_${runId}_act_`,
  };
}

/** Solo la base principal y las de activación de esta ejecución; nunca `omr_preicfes_e2e` ni la de desarrollo. */
export function isRunDatabase(runId, database) {
  const { database: main, activationDatabasePrefix } = runResources(runId);
  return (
    typeof database === 'string' &&
    (database === main || (database.startsWith(activationDatabasePrefix) && /^\d+$/.test(database.slice(activationDatabasePrefix.length))))
  );
}

export function newActivationDatabase(runId) {
  return `${runResources(runId).activationDatabasePrefix}${Date.now()}`;
}

/** Usuario propio de una base de la ejecución (DEC-15). */
export function runUser(runId, database) {
  if (!isRunDatabase(runId, database)) throw new Error('La base no pertenece a la ejecución E2E en curso');
  return `u_${database}`;
}

/** Un usuario de la ejecución: definido en una base de la ejecución y con el nombre que le corresponde. */
export function isRunUser(runId, user, database) {
  return isRunDatabase(runId, database) && user === `u_${database}`;
}

/** Contraseña del usuario de una base: HMAC-SHA256 del secreto de la ejecución. Igual en todos sus procesos. */
export function runPassword(runId, database) {
  runUser(runId, database);
  return createHmac('sha256', runSecret()).update(database).digest('hex');
}

/** URI de MongoDB para los backends: usuario propio de la base, autenticado en ella misma. */
export function runMongoUri(runId, database) {
  return `mongodb://${runUser(runId, database)}:${runPassword(runId, database)}@mongo:27017/${database}?authSource=${database}`;
}

function assertScript(script) {
  if (script.includes("'")) throw new Error('El script de mongosh no puede contener comillas simples');
}

function execMongosh(credentials, database, script, password) {
  const guarded = `if (db.getName() !== ${JSON.stringify(database)}) quit(3); ${script}`;
  const command = `mongosh --quiet ${credentials} ${database} --eval '${guarded}'`;
  const args = ['exec', ...(password === undefined ? [] : ['-e', PASSWORD_ENV]), MONGO_CONTAINER, 'sh', '-c', command];
  const env = password === undefined ? process.env : { ...process.env, [PASSWORD_ENV]: password };
  return execFileSync('docker', args, { encoding: 'utf8', env }).trim();
}

/**
 * Operaciones de las pruebas (DEC-15): mongosh con el usuario propio de `database`, que debe ser de esta ejecución.
 * Aunque el script intentara otra base, MongoDB lo rechazaría por permisos.
 */
export function mongoEval(runId, database, script) {
  if (!isRunDatabase(runId, database)) throw new Error('Solo se escribe en las bases de la ejecución E2E en curso');
  assertScript(script);
  const credentials = `-u ${runUser(runId, database)} -p "$${PASSWORD_ENV}" --authenticationDatabase ${database}`;
  return execMongosh(credentials, database, script, runPassword(runId, database));
}

const ROOT_CREDENTIALS = '-u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin';

/** Cuenta raíz, conectada a una base de la ejecución. Solo para crear o borrar sus usuarios y bases, y para listar. */
function mongoAdminEval(runId, database, script, password) {
  if (!isRunDatabase(runId, database)) throw new Error('Solo se administran las bases de la ejecución E2E en curso');
  assertScript(script);
  return execMongosh(ROOT_CREDENTIALS, database, script, password);
}

/** Nombres de las bases existentes que pertenecen a esta ejecución. Solo lee la lista de bases. */
export function listRunDatabases(runId) {
  const { database } = runResources(runId);
  const names = JSON.parse(mongoAdminEval(runId, database, 'print(JSON.stringify(db.getMongo().getDBNames()));'));
  return names.filter((name) => isRunDatabase(runId, name));
}

/** Usuarios de esta ejecución, en cualquier base (también si la base aún no tiene datos). Solo lectura. */
export function listRunUsers(runId) {
  const { database } = runResources(runId);
  const users = JSON.parse(
    mongoAdminEval(runId, database, 'print(JSON.stringify(db.adminCommand({ usersInfo: { forAllDBs: true } }).users.map((u) => [u.user, u.db])));'),
  );
  return users.filter(([user, db]) => isRunUser(runId, user, db)).map(([user, db]) => ({ user, db }));
}

/** Crea el usuario propio de una base nueva de la ejecución, con `readWrite` solo sobre ella. */
export function createRunUser(runId, database) {
  const user = runUser(runId, database);
  const script = `db.createUser({ user: ${JSON.stringify(user)}, pwd: process.env.${PASSWORD_ENV}, roles: [{ role: "readWrite", db: ${JSON.stringify(database)} }] }); print("ok");`;
  return mongoAdminEval(runId, database, script, runPassword(runId, database));
}

export function dropRunUser(runId, user, database) {
  if (!isRunUser(runId, user, database)) throw new Error('El usuario no pertenece a la ejecución E2E en curso');
  return mongoAdminEval(runId, database, `db.dropUser(${JSON.stringify(user)}); print("ok");`);
}

export function dropRunDatabase(runId, database) {
  return mongoAdminEval(runId, database, 'printjson(db.dropDatabase().ok);');
}

/** Solo lectura, para `listar`: RUN_ID que aparecen en nombres de bases o usuarios de MongoDB. Script fijo. */
export function listRunIdsInMongo() {
  const script = 'print(JSON.stringify([db.getMongo().getDBNames(), db.adminCommand({ usersInfo: { forAllDBs: true } }).users.map((u) => u.db)]));';
  const command = `mongosh --quiet ${ROOT_CREDENTIALS} admin --eval '${script}'`;
  const [dbs, userDbs] = JSON.parse(execFileSync('docker', ['exec', MONGO_CONTAINER, 'sh', '-c', command], { encoding: 'utf8' }).trim());
  const ids = [...dbs, ...userDbs].map((name) => /^omr_test_e2e_(\d{14}_[0-9a-f]{6})(_act_\d+)?$/.exec(name)?.[1]).filter(Boolean);
  return [...new Set(ids)];
}
