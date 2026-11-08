// Backend real y aislado para las pruebas del frontend (HT-AUTH-02 DEC-13). No toca lo de desarrollo:
// imagen y contenedor propios, puerto 3100, base `omr_preicfes_e2e` y Redis 1.
// Uso: node e2e/support/isolated-backend.mjs up | down
//
// De `.env` solo se usan, dentro del contenedor, las credenciales de MongoDB. Nada de `.env` se lee aquí ni se imprime.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const IMAGE = 'omr-preicfes-backend:e2e';
const CONTAINER = 'omr-e2e-backend';
const NETWORK = 'omr-preicfes_omr';
const HEALTH_URL = 'http://127.0.0.1:3100/api/v1/health';
const HEALTH_TIMEOUT_MS = 180_000;

/** Solo para la base aislada, que se puede borrar. Coincide con `e2e/support/env.ts`. */
const SEED_DEV_PASSWORD = 'solo-e2e-local-sin-valor-real';

const secret = () => randomBytes(32).toString('hex');

/** Valores de `apps/backend/test/support/test-env.ts`, salvo el origen y los servicios de la red de Compose. */
const ISOLATED_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  REDIS_URL: 'redis://redis:6379/1',
  APP_PUBLIC_URL: 'http://localhost:5174',
  AUTH_ALLOWED_ORIGINS: 'http://localhost:5174,http://localhost:5175',
  JWT_ACCESS_SECRET: secret(),
  JWT_ACCESS_TTL: '15m',
  SESSION_REFRESH_TTL: '7d',
  VERIFY_TOKEN_TTL: '24h',
  RESET_TOKEN_TTL: '30m',
  ACTIVATION_TOKEN_TTL: '24h',
  AUTH_MIN_RESPONSE_MS: '50',
  // Los límites por IP son más holgados que `test-env.ts`: todas las pruebas comparten IP y Redis 1 conserva los
  // contadores entre ejecuciones (plan §15). Los límites por cuenta y por enlace, que las pruebas verifican, no cambian.
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
};

/**
 * Segundo backend, solo para activar cuentas: `bootstrap:admin` exige una base sin administrador activo y solo admite
 * una cuenta inicial, así que cada ejecución de las pruebas usa una base nueva. Nada se borra: las bases anteriores
 * quedan en MongoDB hasta que se autorice limpiarlas.
 */
const ACTIVATION_CONTAINER = 'omr-e2e-backend-activacion';
const ACTIVATION_HEALTH_URL = 'http://127.0.0.1:3101/api/v1/health';
const ACTIVATION_DB = /^omr_preicfes_e2e_activacion_\d+$/;

// Se expande dentro del contenedor: las credenciales no pasan por este proceso ni por sus argumentos.
const mongoUri = (database) =>
  `export MONGODB_URI="mongodb://\${MONGO_ROOT_USER}:\${MONGO_ROOT_PASSWORD_URLENCODED}@mongo:27017/${database}?authSource=admin"`;

const START_COMMAND = [mongoUri('omr_preicfes_e2e'), 'pnpm build', 'node dist/cli/migrate.js up', 'exec node dist/main.js'].join(' && ');

// `NODE_ENV=production`, solo para migrar: el runner omite el seed, que crearía un administrador activo.
const activationStartCommand = (database) =>
  [mongoUri(database), 'pnpm build', 'NODE_ENV=production node dist/cli/migrate.js up', 'exec node dist/main.js'].join(' && ');

function run(command, args, { allowFailure = false, quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: quiet ? 'ignore' : 'inherit' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`Falló: ${command} ${args[0]} (código ${result.status})`);
  }
  return result.status === 0;
}

async function waitForHealth(container, healthUrl) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const running = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', container], { encoding: 'utf8' });
    if (running.stdout.trim() !== 'true') {
      throw new Error(`El contenedor terminó antes de responder. Revisar: docker logs ${container}`);
    }
    try {
      if ((await fetch(healthUrl)).ok) return;
    } catch {
      // Aún arrancando: se reintenta hasta el plazo.
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(`Sin respuesta de ${healthUrl}. Revisar: docker logs ${container}`);
}

async function startContainer({ container, port, env, command, healthUrl }) {
  run('docker', ['build', '-q', '-t', IMAGE, 'apps/backend']);
  // El contenedor anterior se detiene y se conserva con otro nombre: limpiar requiere autorización.
  if (run('docker', ['inspect', container], { allowFailure: true, quiet: true })) {
    run('docker', ['stop', container], { quiet: true });
    run('docker', ['rename', container, `${container}-anterior-${Date.now()}`], { quiet: true });
  }

  const dir = mkdtempSync(join(tmpdir(), 'omr-e2e-'));
  const envFile = join(dir, 'e2e.env');
  writeFileSync(envFile, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'));
  try {
    run('docker', [
      'run', '-d', '-q', '--name', container, '--network', NETWORK, '-p', `127.0.0.1:${port}:3000`,
      '--env-file', '.env', '--env-file', envFile,
      IMAGE, 'sh', '-c', command,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  await waitForHealth(container, healthUrl);
  console.log(`Backend aislado listo en ${healthUrl}`);
}

function up() {
  return startContainer({ container: CONTAINER, port: 3100, env: ISOLATED_ENV, command: START_COMMAND, healthUrl: HEALTH_URL });
}

function upActivation(database) {
  if (!ACTIVATION_DB.test(database ?? '')) throw new Error('Base de activación no válida');
  return startContainer({
    container: ACTIVATION_CONTAINER,
    port: 3101,
    env: {
      ...ISOLATED_ENV,
      // Redis propio: sus colas y contadores no se mezclan con los del backend principal de las pruebas.
      REDIS_URL: 'redis://redis:6379/2',
      APP_PUBLIC_URL: 'http://localhost:5175',
      AUTH_ALLOWED_ORIGINS: 'http://localhost:5175',
    },
    command: activationStartCommand(database),
    healthUrl: ACTIVATION_HEALTH_URL,
  });
}

function down() {
  run('docker', ['rm', '-f', CONTAINER], { allowFailure: true, quiet: true });
  run('docker', ['rm', '-f', ACTIVATION_CONTAINER], { allowFailure: true, quiet: true });
  console.log('Backends aislados detenidos.');
}

const action = process.argv[2];
if (action === 'up') await up();
else if (action === 'activacion') await upActivation(process.argv[3]);
else if (action === 'down') down();
else {
  console.error('Uso: node e2e/support/isolated-backend.mjs up | activacion <base> | down');
  process.exitCode = 2;
}
