import { defineConfig, devices } from '@playwright/test';
import { ACTIVATION_ORIGIN, APP_ORIGIN, TLS_ORIGIN } from './e2e/support/env.ts';

/**
 * E2E contra el backend real y aislado (DEC-13). Antes de ejecutar:
 *   node e2e/support/isolated-backend.mjs up
 * Chromium ejecuta la suite completa. Firefox y WebKit solo la compatibilidad (DEC-12): WebKit no envía la cookie
 * `Secure` sobre `http://localhost`, así que los flujos de sesión corren en ese motor sobre un proxy HTTPS de pruebas.
 * `e2e/manual/` se ejecuta aparte, con `playwright.produccion.config.ts`.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: /manual[\\/]/,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: APP_ORIGIN, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: /compatibilidad-/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /compatibilidad-sesion/ },
    {
      name: 'webkit-https',
      use: { ...devices['Desktop Safari'], baseURL: TLS_ORIGIN, ignoreHTTPSErrors: true },
      testMatch: /compatibilidad-flujos/,
    },
  ],
  webServer: [
    {
      command: 'node node_modules/vite/bin/vite.js --port 5174',
      url: APP_ORIGIN,
      reuseExistingServer: false,
      // La sitekey no se valida: el script de Turnstile se sustituye en las pruebas (DEC-06).
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3100', VITE_CAPTCHA_SITE_KEY: 'sitekey-solo-pruebas' },
    },
    {
      // Hacia el backend de activación, que esa prueba levanta con una base nueva (`e2e/support/isolated-backend.mjs`).
      command: 'node node_modules/vite/bin/vite.js --port 5175',
      url: ACTIVATION_ORIGIN,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101', VITE_CAPTCHA_SITE_KEY: 'sitekey-solo-pruebas' },
    },
    {
      command: 'node e2e/support/tls-proxy.mjs',
      url: TLS_ORIGIN,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
    },
  ],
});
