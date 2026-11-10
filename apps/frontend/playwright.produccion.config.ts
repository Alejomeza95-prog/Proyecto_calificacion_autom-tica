import { defineConfig, devices } from '@playwright/test';
import { APP_ORIGIN, BACKEND_ORIGIN } from './e2e/support/env.ts';

/**
 * Bundle de producción con la CSP y la `Referrer-Policy` documentadas, y el script real de Cloudflare con su sitekey de
 * prueba pública «siempre pasa». Requiere internet. No sustituye la prueba manual con las credenciales del proyecto:
 * esa sitekey no equivale a un widget con dominios autorizados, y el backend sigue con su adaptador `test`.
 *   pnpm test:e2e:produccion
 * El entorno aislado de la ejecución se crea y se limpia como en `playwright.config.ts` (DEC-14).
 */
const OUT_DIR = 'node_modules/.cache/omr-e2e-produccion';

export default defineConfig({
  testDir: './e2e/manual',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/support/global-setup.mjs',
  globalTeardown: './e2e/support/global-teardown.mjs',
  use: { baseURL: APP_ORIGIN, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js build --outDir ${OUT_DIR} --emptyOutDir && node node_modules/vite/bin/vite.js preview --outDir ${OUT_DIR} --port 5174 --strictPort`,
    url: APP_ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { API_PROXY_TARGET: BACKEND_ORIGIN, VITE_CAPTCHA_SITE_KEY: '1x00000000000000000000AA' },
  },
});
