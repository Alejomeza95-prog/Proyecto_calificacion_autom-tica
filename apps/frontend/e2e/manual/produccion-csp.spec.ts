import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { uniqueEmail } from '../support/env.ts';

/**
 * Bundle de producción con las cabeceras documentadas en `docs/onboarding/06-frontend-autenticacion.md`. Las cabeceras
 * se añaden aquí, sobre `vite preview`: comprueban la política, no un servidor de despliegue, que aún no está definido.
 */
const AUTH = '/api/v1/auth';
const APP = 'http://localhost:5174';
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');
const VIOLATION = 'VIOLACION-CSP';
const WIDGET_TIMEOUT = 30_000;

async function applyHeaders(context: BrowserContext): Promise<void> {
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document' || !route.request().url().startsWith(APP)) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP, 'referrer-policy': 'no-referrer' },
    });
  });
}

function watchViolations(page: Page) {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().startsWith(VIOLATION)) violations.push(message.text());
  });
  return violations;
}

test.beforeEach(async ({ context, page }) => {
  await applyHeaders(context);
  await page.addInitScript((prefix) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`${prefix} ${location.origin} ${event.violatedDirective} ${event.blockedURI}`);
    });
  }, VIOLATION);
});

test('las pantallas del bundle no violan la CSP ni piden recursos externos', async ({ page }) => {
  const violations = watchViolations(page);
  const external: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('http') && !r.url().startsWith(APP)) external.push(r.url());
  });

  for (const path of ['/iniciar-sesion', '/registro', '/revisa-tu-correo', '/reenviar-verificacion', '/verificar-correo#token=x', '/olvide-contrasena', '/restablecer-contrasena#token=x', '/activar-cuenta#token=x']) {
    await page.goto('about:blank');
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main a, main button, main input').first()).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
  }

  expect(violations).toEqual([]);
  expect(external).toEqual([]);
  await expect(page.locator('script:not([src])')).toHaveCount(0);
});

test('el POST lleva Origin con Referrer-Policy: no-referrer, y el backend lo acepta', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  const sent = page.waitForRequest((r) => r.url().endsWith(`${AUTH}/login`));
  const responded = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));

  await page.getByLabel('Correo').fill(uniqueEmail('produccion'));
  await page.getByLabel('Contraseña', { exact: true }).fill('clave-de-prueba-e2e-larga');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  const headers = await (await sent).allHeaders();
  expect(headers['origin']).toBe(APP);
  expect(headers['referer']).toBeUndefined();
  expect((await responded).status()).toBe(401);
});

test('el script real de Cloudflare carga con la CSP y no-referrer, y su respuesta llega al backend', async ({ page }) => {
  test.setTimeout(120_000);
  const violations = watchViolations(page);
  const cloudflare: { readonly url: string; readonly referer: string | undefined }[] = [];
  page.on('request', (r) => {
    if (r.url().includes('challenges.cloudflare.com')) cloudflare.push({ url: r.url(), referer: r.headers()['referer'] });
  });
  await page.goto('/iniciar-sesion');
  const correo = uniqueEmail('produccion-widget');
  const submit = async () => {
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill('clave-de-prueba-e2e-larga');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const responded = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
    await submit();
    await responded;
    // El formulario vacía la contraseña tras el rechazo: rellenarla antes haría perder el siguiente intento.
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
  }
  expect(cloudflare).toEqual([]);

  await submit();

  await expect(page.getByRole('group', { name: 'Verificación de seguridad' })).toBeAttached();
  await expect.poll(() => cloudflare.length, { timeout: WIDGET_TIMEOUT }).toBeGreaterThan(0);
  expect(cloudflare[0]?.url).toContain('/turnstile/v0/api.js');
  expect(cloudflare[0]?.referer).toBeUndefined();

  // El iframe del widget se crea con la política activa.
  await expect.poll(() => page.frames().some((frame) => frame.url().includes('challenges.cloudflare.com')), { timeout: WIDGET_TIMEOUT }).toBe(true);

  // La sitekey de prueba entrega un token de prueba, que el adaptador `test` del backend rechaza: es lo esperado.
  // Mientras no llega el token, pulsar solo repite el aviso. Se deja de pulsar en cuanto se envía, para leer el resultado.
  let tokenSent = false;
  const sent = page.waitForRequest((r) => {
    tokenSent = r.url().endsWith(`${AUTH}/login`) && r.postData()?.includes('captchaToken') === true;
    return tokenSent;
  }, { timeout: WIDGET_TIMEOUT });
  await expect
    .poll(
      async () => {
        if (!tokenSent) await page.getByRole('button', { name: 'Iniciar sesión' }).click();
        return tokenSent;
      },
      { timeout: WIDGET_TIMEOUT, intervals: [2000] },
    )
    .toBe(true);
  await expect(page.getByText('No pudimos validar la verificación de seguridad')).toBeVisible();
  const body = (await sent).postDataJSON() as { captchaToken: string };
  expect(body.captchaToken.length).toBeGreaterThan(0);
  await expect(page.getByText('No podemos completar la verificación de seguridad')).toHaveCount(0);
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  expect(violations).toEqual([]);
});
