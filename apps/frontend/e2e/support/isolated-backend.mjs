// Backend real y aislado para las pruebas del frontend (HT-AUTH-02 DEC-14 y DEC-15; reemplaza el aislamiento de DEC-13).
// Cada ejecución tiene un RUN_ID y crea solo recursos propios:
// - Redis temporal `omr-e2e-<RUN_ID>-redis`, sin puertos publicados ni persistencia;
// - base `omr_test_e2e_<RUN_ID>` (y `..._act_<n>` para la activación) en el MongoDB de Compose, cada una con su usuario
//   `u_<base>` y rol `readWrite` solo sobre ella (DEC-15);
// - backends `omr-e2e-<RUN_ID>-backend` (127.0.0.1:3200) y `omr-e2e-<RUN_ID>-backend-act` (127.0.0.1:3201), que se
//   conectan con ese usuario: no reciben `.env` ni las credenciales raíz de MongoDB;
// - imagen `omr-preicfes-backend:e2e-<RUN_ID>`.
// Contenedores e imagen llevan la etiqueta `omr.e2e.run=<RUN_ID>`. La limpieza solo borra eso. No se tocan los
// contenedores anteriores (`omr-e2e-backend*`), `omr_preicfes_e2e`, las bases `omr_preicfes_e2e_activacion_*`,
// el Redis ni la base de desarrollo. Mailpit es el de Compose y no se modifica: cada correo es único.
//
// `global-setup.mjs` y `global-teardown.mjs` lo usan automáticamente. Uso manual (solo para lo conservado con
// E2E_KEEP=1 o tras una interrupción): node e2e/support/isolated-backend.mjs listar | down <RUN_ID>
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertRunId,
  createRunUser,
  dropRunDatabase,
  dropRunUser,
  isRunDatabase,
  listRunDatabases,
  listRunIdsInMongo,
  listRunUsers,
  NETWORK,
  ROLE_LABEL,
  RUN_ID_PATTERN,
  RUN_LABEL,
  runMongoUri,
  runResources,
} from './e2e-run.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
/** Imagen propia de la ejecución, con su etiqueta: no se reetiqueta `omr-preicfes-backend:e2e`, que usan los contenedores de DEC-13. */
const imageOf = (runId) => `omr-preicfes-backend:e2e-${runId}`;
/** La misma imagen que el Redis de Compose. */
const REDIS_IMAGE = 'redis:7-alpine';
/** Coinciden con `e2e/support/env.ts`. Distintos de 3100/3101, que usan los contenedores de DEC-13. */
const BACKEND_PORT = 3200;
const ACTIVATION_PORT = 3201;
const HEALTH_TIMEOUT_MS = 180_000;

/** Solo para la base de la ejecución, que se borra al terminar. Coincide con `e2e/support/env.ts`. */
const SEED_DEV_PASSWORD = 'solo-e2e-local-sin-valor-real';

const secret = () => randomBytes(32).toString('hex');

/**
 * Valores de `apps/backend/test/support/test-env.ts`, salvo el origen y los servicios de la red de Compose. Es el
 * entorno completo del backend: no se le pasa `.env` (DEC-15). `CAPTCHA_SECRET`, la única variable que el backend
 * lee y aquí no se fija, es opcional con `CAPTCHA_PROVIDER=test`.
 */
const isolatedEnv = (mongoUri, redisUrl) => ({
  NODE_ENV: 'test',
  PORT: '3000',
  MONGODB_URI: mongoUri,
  REDIS_URL: redisUrl,
  APP_PUBLIC_URL: 'http://localhost:5174',
  AUTH_ALLOWED_ORIGINS: 'http://localhost:5174,http://localhost:5175',
  JWT_ACCESS_SECRET: secret(),
  JWT_ACCESS_TTL: '15m',
  SESSION_REFRESH_TTL: '7d',
  VERIFY_TOKEN_TTL: '24h',
  RESET_TOKEN_TTL: '30m',
  ACTIVATION_TOKEN_TTL: '24h',
  AUTH_MIN_RESPONSE_MS: '50',
  // Los límites por IP son más holgados que `test-env.ts`: todas las pruebas de una ejecución comparten IP. Cada
  // ejecución empieza con un Redis vacío. Los límites por cuenta y por enlace, que las pruebas verifican, no cambian.
  RATE_LIMIT_LOGIN_IP_FAILURE: '5000/15m',
  RATE_LIMIT_LOGIN_CHALLENGE_IP: '5000/15m',
  RATE_LIMIT_LOGIN_CHALLENGE_ACCOUNT: '5/15m',
  RATE_LIMIT_REGISTER_EMAIL: '3/1h',
  RATE_LIMIT_REGISTER_IP: '5000/1h',
  RATE_LIMIT_RESEND_ACCOUNT: '3/1h',
  RATE_LIMIT_RESEND_IP: '5000/1h',
  RATE_LIMIT_VERIFY_TOKEN: '10/15m',
  RATE_LIMIT_VERIFY_IP: '5000/15m',
  RATE_LIMIT_FORGOT_ACCOUNT: '3/1h',
  RATE_LIMIT_FORGOT_IP: '5000/1h',
  RATE_LIMIT_RESET_TOKEN: '5/15m',
  RATE_LIMIT_RESET_IP: '5000/15m',
  RATE_LIMIT_ACTIVATE_TOKEN: '5/15m',
  RATE_LIMIT_ACTIVATE_IP: '5000/15m',
  RATE_LIMIT_AUTH_GLOBAL: '10000/1m',
  RATE_LIMIT_KEY_PEPPER: secret(),
  RATE_LIMIT_REDIS_TIMEOUT_MS: '5000',
  TRUST_PROXY_HOPS: '0',
  SESSION_MAX_ROTATIONS: '1000',
  AUTH_OVERLOAD_RETRY_AFTER_S: '5',
  ARGON2_MAX_CONCURRENCY: '2',
  ARGON2_QUEUE_MAX: '16',
  ARGON2_QUEUE_TIMEOUT_MS: '5000',
  UV_THREADPOOL_SIZE: '4',
  CAPTCHA_PROVIDER: 'test',
  CAPTCHA_VERIFY_TIMEOUT_MS: '3000',
  SMTP_HOST: 'mailpit',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  SMTP_USER: '',
  SMTP_PASSWORD: '',
  SMTP_CONNECTION_TIMEOUT_MS: '5000',
  SMTP_GREETING_TIMEOUT_MS: '5000',
  SMTP_SOCKET_TIMEOUT_MS: '10000',
  MAIL_FROM: 'no-responder@example.test',
  MAIL_DRAIN_TIMEOUT_MS: '2000',
  METRICS_PORT: '0',
  METRICS_HOST: '127.0.0.1',
  AUDIT_IP_PEPPER: secret(),
  SEED_DEV_PASSWORD,
});

/**
 * Migra la base de la ejecución y arranca la API, ambas con `MONGODB_URI` del usuario propio de la base. `migrateEnv`:
 * - `test` en el backend principal: aplica la semilla (`admin.seed`) que usan las pruebas de sesión;
 * - `production` en el de activación: omite la semilla (DEC-28 de HT-AUTH-01), porque `bootstrap:admin` exige una
 *   base sin administrador activo.
 */
const startCommand = (migrateEnv) =>
  ['pnpm build', `NODE_ENV=${migrateEnv} node dist/cli/migrate.js up`, 'exec node dist/main.js'].join(' && ');

function run(command, args, { allowFailure = false, quiet = false, capture = false } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: capture ? 'pipe' : quiet ? 'ignore' : 'inherit', encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Falló: ${command} ${args[0]} (código ${result.status})`);
  }
  const raw = result.stdout ?? '';
  // `exact`: solo sin el salto de línea final, para comparar etiquetas sin perder espacios que formen parte del valor.
  return { ok: result.status === 0, stdout: raw.trim(), exact: raw.replace(/\r?\n$/, '') };
}

const labels = (runId, role) => ['--label', `${RUN_LABEL}=${runId}`, '--label', `${ROLE_LABEL}=${role}`];

/**
 * F6: solo contenedores (`--type container`), nunca imágenes, volúmenes ni redes con el mismo nombre.
 * Devuelve el ID completo, el nombre y la etiqueta de ejecución leídos del propio contenedor, o `null` si no existe.
 */
function inspectContainer(ref) {
  const inspected = run('docker', ['inspect', '--type', 'container', '-f', `{{.Id}}\t{{.Name}}\t{{index .Config.Labels "${RUN_LABEL}"}}`, ref], {
    allowFailure: true,
    capture: true,
  });
  if (!inspected.ok) return null;
  const [id, name, runLabel] = inspected.exact.split('\t');
  return { id, name: name.replace(/^\//, ''), runLabel: runLabel ?? '' };
}

/** Un contenedor es de la ejecución si su etiqueta es exactamente el RUN_ID y su nombre lleva el prefijo de la ejecución. */
const belongsToRun = (container, runId) =>
  container !== null && container.runLabel === runId && container.name.startsWith(`omr-e2e-${runId}-`);

/** Una base nueva para esta ejecución: si ya existiera (o ya tuviera usuario), no se migra sobre ella. */
function assertFreshDatabase(runId, database) {
  if (!isRunDatabase(runId, database)) throw new Error('La base no pertenece a la ejecución E2E en curso');
  if (listRunDatabases(runId).includes(database)) throw new Error(`La base ${database} ya existe: no se migra sobre bases existentes`);
  if (listRunUsers(runId).some((u) => u.db === database)) throw new Error(`La base ${database} ya tiene usuario: no se reutiliza`);
}

async function waitFor(check, failure) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(failure);
}

function assertRunning(container) {
  const running = run('docker', ['inspect', '--type', 'container', '-f', '{{.State.Running}}', container], { allowFailure: true, capture: true });
  if (running.stdout !== 'true') throw new Error(`El contenedor terminó antes de responder. Revisar: docker logs ${container}`);
}

async function startRedis(runId) {
  const { redis } = runResources(runId);
  run('docker', [
    'run', '-d', '-q', '--name', redis, ...labels(runId, 'redis'), '--network', NETWORK,
    REDIS_IMAGE, 'redis-server', '--save', '', '--appendonly', 'no',
  ]);
  await waitFor(() => {
    assertRunning(redis);
    return run('docker', ['exec', redis, 'redis-cli', 'ping'], { allowFailure: true, capture: true }).stdout === 'PONG';
  }, `Redis de la ejecución sin respuesta. Revisar: docker logs ${redis}`);
}

async function startBackend({ runId, container, role, port, database, migrateEnv, redisUrl, envOverrides = {} }) {
  assertFreshDatabase(runId, database);
  createRunUser(runId, database);
  run('docker', ['build', '-q', '--label', `${RUN_LABEL}=${runId}`, '-t', imageOf(runId), 'apps/backend']);

  // El archivo lleva la URI con la contraseña del usuario de la base: se crea en una carpeta temporal y se borra al
  // arrancar el contenedor. No se imprime.
  const dir = mkdtempSync(join(tmpdir(), 'omr-e2e-'));
  const envFile = join(dir, 'e2e.env');
  const env = { ...isolatedEnv(runMongoUri(runId, database), redisUrl), ...envOverrides };
  writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
  try {
    run('docker', [
      'run', '-d', '-q', '--name', container, ...labels(runId, role), '--network', NETWORK, '-p', `127.0.0.1:${port}:3000`,
      '--env-file', envFile,
      imageOf(runId), 'sh', '-c', startCommand(migrateEnv),
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const healthUrl = `http://127.0.0.1:${port}/api/v1/health`;
  await waitFor(async () => {
    assertRunning(container);
    try {
      return (await fetch(healthUrl)).ok;
    } catch {
      return false; // Aún arrancando: se reintenta hasta el plazo.
    }
  }, `Sin respuesta de ${healthUrl}. Revisar: docker logs ${container}`);
  console.log(`Backend aislado listo en ${healthUrl} (base ${database})`);
}

/** Redis temporal y backend principal de la ejecución. */
export async function up(runId) {
  const { redis, backend, database } = runResources(runId);
  await startRedis(runId);
  await startBackend({
    runId,
    container: backend,
    role: 'backend',
    port: BACKEND_PORT,
    database,
    migrateEnv: 'test',
    redisUrl: `redis://${redis}:6379/0`,
  });
}

/**
 * Backend de activación con una base nueva de la ejecución. Si ya había uno de esta misma ejecución (por ejemplo, si
 * Playwright repite el `beforeAll` tras reiniciar el proceso de pruebas), se reemplaza: se elimina o, con E2E_KEEP=1,
 * se detiene y se renombra conservando la etiqueta, para que `down` lo encuentre. Su base y su usuario se conservan
 * hasta la limpieza. F7: se actúa sobre el ID comprobado, no sobre el nombre.
 */
export async function upActivation(runId, database) {
  const { redis, activation } = runResources(runId);
  if (!database.startsWith(runResources(runId).activationDatabasePrefix) || !isRunDatabase(runId, database)) {
    throw new Error('Base de activación no válida para esta ejecución');
  }
  const previous = inspectContainer(activation);
  if (previous !== null) {
    if (!belongsToRun(previous, runId)) throw new Error(`${activation} no pertenece a esta ejecución`);
    if (process.env.E2E_KEEP === '1') {
      run('docker', ['stop', previous.id], { quiet: true });
      run('docker', ['rename', previous.id, `${activation}-${Date.now()}`], { quiet: true });
    } else {
      run('docker', ['rm', '-f', previous.id], { quiet: true });
    }
  }
  await startBackend({
    runId,
    container: activation,
    role: 'activation',
    port: ACTIVATION_PORT,
    database,
    migrateEnv: 'production',
    redisUrl: `redis://${redis}:6379/1`,
    envOverrides: { APP_PUBLIC_URL: 'http://localhost:5175', AUTH_ALLOWED_ORIGINS: 'http://localhost:5175' },
  });
}

/** El contenedor de activación de la ejecución en curso, comprobado (F6/F7): devuelve su ID. */
export function activationContainerId(runId) {
  const container = inspectContainer(runResources(runId).activation);
  if (!belongsToRun(container, runId)) throw new Error('El backend de activación no pertenece a la ejecución E2E en curso');
  return container.id;
}

const lines = (text) => text.split(/\r?\n/).filter(Boolean);

/**
 * Elimina solo lo de esta ejecución, en este orden: contenedores (nada sigue escribiendo), usuarios, bases e imagen.
 * - Contenedores: los que lista el filtro exacto de la etiqueta se vuelven a inspeccionar por ID (F6) y se borran por
 *   ese ID (F7) solo si su etiqueta y su nombre son de la ejecución.
 * - Usuarios y bases: solo los que `isRunUser` / `isRunDatabase` reconocen como de la ejecución (DEC-15).
 * Un paso fallido no detiene los demás: los errores se reúnen y se lanzan al final, y repetir `down` es seguro.
 */
export function down(runId) {
  assertRunId(runId);
  const errors = [];
  const attempt = (what, action) => {
    try {
      action();
    } catch (error) {
      errors.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  let listed = [];
  attempt('listar contenedores', () => {
    listed = lines(run('docker', ['ps', '-a', '--no-trunc', '--filter', `label=${RUN_LABEL}=${runId}`, '--format', '{{.ID}}'], { capture: true }).stdout);
  });
  const removed = [];
  for (const id of listed) {
    attempt(id.slice(0, 12), () => {
      const container = inspectContainer(id);
      if (container === null) return; // Ya no existe.
      if (container.id !== id || !belongsToRun(container, runId)) throw new Error(`contenedor ${container.name} ajeno a la ejecución; no se toca`);
      run('docker', ['rm', '-f', container.id], { quiet: true });
      removed.push(container.name);
    });
  }

  let users = [];
  attempt('listar usuarios', () => {
    users = listRunUsers(runId);
  });
  const droppedUsers = [];
  for (const { user, db } of users) {
    attempt(user, () => {
      dropRunUser(runId, user, db);
      droppedUsers.push(user);
    });
  }

  let databases = [];
  attempt('listar bases', () => {
    databases = listRunDatabases(runId);
  });
  const dropped = [];
  for (const database of databases) {
    attempt(database, () => {
      dropRunDatabase(runId, database);
      dropped.push(database);
    });
  }

  const image = imageOf(runId);
  let imageRemoved = false;
  attempt(image, () => {
    const owner = run('docker', ['image', 'inspect', '-f', `{{index .Config.Labels "${RUN_LABEL}"}}`, image], {
      allowFailure: true,
      capture: true,
    });
    if (!owner.ok) return; // No se llegó a construir.
    if (owner.exact !== runId) throw new Error('imagen ajena a la ejecución; no se toca');
    // Por etiqueta: si la imagen tuviera otras etiquetas, Docker solo quita esta.
    run('docker', ['image', 'rm', image], { quiet: true });
    imageRemoved = true;
  });

  console.log(
    `Limpieza E2E ${runId}: ${removed.length} contenedores, ${droppedUsers.length} usuarios, ${dropped.length} bases y ` +
      `${imageRemoved ? 1 : 0} imagen eliminados.`,
  );
  if (errors.length > 0) {
    throw new Error(`Limpieza E2E ${runId} incompleta (repetir: node e2e/support/isolated-backend.mjs down ${runId}):\n- ${errors.join('\n- ')}`);
  }
  return { containers: removed, users: droppedUsers, databases: dropped, imageRemoved };
}

/**
 * Solo lectura: RUN_ID con recursos pendientes (p. ej., tras una interrupción), en contenedores o imágenes
 * etiquetados y en nombres de bases o usuarios de MongoDB.
 */
export function listRuns() {
  const fromContainers = lines(run('docker', ['ps', '-a', '--filter', `label=${RUN_LABEL}`, '--format', `{{.Label "${RUN_LABEL}"}}`], { capture: true }).stdout);
  const fromImages = lines(run('docker', ['image', 'ls', '--filter', `label=${RUN_LABEL}`, '--format', '{{.Tag}}'], { capture: true }).stdout)
    .map((tag) => tag.replace(/^e2e-/, ''));
  return [...new Set([...fromContainers, ...fromImages, ...listRunIdsInMongo()])].filter((id) => RUN_ID_PATTERN.test(id)).sort();
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const [action, runId, database] = process.argv.slice(2);
  if (action === 'activacion' && runId && database) await upActivation(assertRunId(runId), database);
  else if (action === 'down' && runId) down(assertRunId(runId));
  else if (action === 'listar') console.log(listRuns().join('\n') || 'Sin ejecuciones E2E con recursos pendientes.');
  else {
    console.error('Uso: node e2e/support/isolated-backend.mjs listar | down <RUN_ID> | activacion <RUN_ID> <base>');
    process.exitCode = 2;
  }
}
