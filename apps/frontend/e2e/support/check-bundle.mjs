// V-6 (plan §8): compila con valores centinela y comprueba que solo `VITE_*` puede llegar al bundle.
// Uso: node e2e/support/check-bundle.mjs
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORBIDDEN = {
  CAPTCHA_SECRET: 'centinela-captcha-secret',
  JWT_ACCESS_SECRET: 'centinela-jwt-secret',
  API_PROXY_TARGET: 'http://centinela-proxy.invalid',
  CAPTCHA_SITE_KEY: 'centinela-captcha-site-key',
};

const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], {
  cwd: FRONTEND,
  env: { ...process.env, ...FORBIDDEN },
  stdio: 'ignore',
});
if (build.status !== 0) throw new Error(`Falló la compilación (código ${build.status})`);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const bundle = files(join(FRONTEND, 'dist')).map((path) => readFileSync(path, 'utf8')).join('\n');
const leaked = Object.keys(FORBIDDEN).filter((name) => bundle.includes(FORBIDDEN[name]) || bundle.includes(name));
if (leaked.length > 0) {
  console.error(`V-6 FALLA, en el bundle: ${leaked.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`V-6 OK: ${Object.keys(FORBIDDEN).join(', ')} ausentes del bundle.`);
}
