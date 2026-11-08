import { expect, test, type Page } from '@playwright/test';
import { uniqueEmail } from './support/env.ts';
import { readLink } from './support/mailpit.ts';
import { createActiveAccount, registerAccount, TEST_NAME, TEST_PASSWORD } from './support/test-accounts.ts';

/**
 * Flujos que dependen del navegador, con backend y Mailpit reales, en Chromium, Firefox y WebKit (DEC-12, RN-12,
 * RNF-04). Solo Turnstile se sustituye (DEC-06). WebKit corre sobre el proxy HTTPS de pruebas.
 */
const AUTH = '/api/v1/auth';
const NEW_PASSWORD = 'otra-clave-de-prueba-e2e-larga';
const CLOSED = 'Tu sesión se cerró.';

async function submitLogin(page: Page, correo: string, password = TEST_PASSWORD): Promise<void> {
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function login(page: Page, correo: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await submitLogin(page, correo);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

/** El enlace del correo apunta al origen configurado en el backend: se abre en el del proyecto en curso. */
function sameOriginLink(link: string): string {
  const url = new URL(link);
  return `${url.pathname}${url.hash}`;
}

function authCalls(page: Page) {
  const calls: { readonly path: string; readonly status: number }[] = [];
  page.on('response', (r) => {
    const { pathname } = new URL(r.url());
    if (pathname.startsWith(`${AUTH}/`)) calls.push({ path: pathname.slice(AUTH.length + 1), status: r.status() });
  });
  return calls;
}

test.describe('Sesión y rutas protegidas', () => {
  test('entrar, recargar, renovar y cerrar por la interfaz', async ({ page }) => {
    const correo = await createActiveAccount('compat-sesion');
    await login(page, correo);
    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();

    const calls = authCalls(page);
    await page.reload();
    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
    await expect(page).toHaveURL(/\/inicio$/);
    expect(calls).toEqual([
      { path: 'refresh', status: 200 },
      { path: 'me', status: 200 },
    ]);
    expect(await page.evaluate(() => document.cookie)).not.toContain('omr_refresh');

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('status')).toHaveText(CLOSED);
    await expect(page).toHaveURL(/\/iniciar-sesion$/);

    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  });

  test('tras cerrar sesión, volver atrás en el historial no muestra la pantalla privada', async ({ page }) => {
    const correo = await createActiveAccount('compat-atras');
    await login(page, correo);
    // Cada carga renueva la sesión: se espera a que termine antes de navegar (plan §15, renovación interrumpida).
    const restored = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/me`));
    await page.goto('/registro');
    await restored;
    await page.goto('/inicio');
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('status')).toHaveText(CLOSED);

    await page.goBack();
    await expect(page).toHaveURL(/\/registro$/);
    await page.goBack();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toHaveCount(0);
  });

  test('sin sesión, /inicio lleva a entrar, y al entrar se vuelve a la ruta pedida', async ({ page }) => {
    const correo = await createActiveAccount('compat-retorno');

    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await submitLogin(page, correo);

    await expect(page).toHaveURL(/\/inicio$/);
  });

  test('la navegación entre pantallas actualiza la ruta y el título, y mueve el foco', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    const card = page.getByRole('main');

    await card.getByRole('link', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(/\/registro$/);
    await expect(page).toHaveTitle('Crear cuenta · OMR-PreICFES');
    await expect(page.getByLabel('Nombre')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    await card.getByRole('link', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await expect(page).toHaveTitle('Iniciar sesión · OMR-PreICFES');
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    await card.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
    await expect(page).toHaveURL(/\/olvide-contrasena$/);
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await expect(page).toHaveTitle('Iniciar sesión · OMR-PreICFES');
    await page.goForward();
    await expect(page).toHaveURL(/\/olvide-contrasena$/);
  });

  test('el registro por la interfaz lleva a Revisa tu correo', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Nombre').fill(TEST_NAME);
    await page.getByLabel('Correo').fill(uniqueEmail('compat-registro'));
    await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);

    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page).toHaveURL(/\/revisa-tu-correo$/);
  });

  test('la cuenta pendiente recibe el rechazo genérico y no entra', async ({ page }) => {
    const correo = await registerAccount('compat-pendiente');
    await page.goto('/iniciar-sesion');

    await submitLogin(page, correo);

    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
  });
});

test.describe('Enlaces con token (RN-06, RN-07, RN-13)', () => {
  test('la verificación real retira el token de la URL y el POST lleva Origin pese a no-referrer', async ({ page, baseURL }) => {
    const correo = await registerAccount('compat-enlace');
    const external: string[] = [];
    const origin = () => String(baseURL);
    page.on('request', (r) => {
      if (new URL(r.url()).origin !== origin()) external.push(r.url());
    });

    await page.goto(sameOriginLink(await readLink(correo, '/verificar-correo')));

    await expect(page.getByRole('button', { name: 'Confirmar mi correo' })).toBeVisible();
    expect(page.url()).toBe(`${origin()}/verificar-correo`);
    expect(await page.evaluate(() => document.querySelector('meta[name="referrer"]')?.getAttribute('content'))).toBe('no-referrer');
    const sent = page.waitForRequest((r) => r.url().endsWith(`${AUTH}/verify-email`));

    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();

    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');
    expect((await (await sent).allHeaders())['origin']).toBe(origin());
    expect(external).toEqual([]);
  });

  test('recuperar la contraseña con el enlace real, y entrar con la nueva', async ({ page }) => {
    const correo = await createActiveAccount('compat-recupera');
    await page.goto('/olvide-contrasena');
    await page.getByLabel('Correo').fill(correo);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('status')).toBeVisible();

    const link = sameOriginLink(await readLink(correo, '/restablecer-contrasena'));
    await page.goto('about:blank');
    await page.goto(link);
    await page.getByLabel('Nueva contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
    await page.getByRole('link', { name: 'Ir a Iniciar sesión' }).click();

    await expect(page.getByLabel('Correo')).toBeVisible();
    await submitLogin(page, correo, NEW_PASSWORD);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });
});

test.describe('Dos pestañas reales (RN-12)', () => {
  // Dos pestañas cargan a la vez los módulos sin empaquetar de Vite: en WebKit, por el proxy TLS, no caben en 30 s.
  test.describe.configure({ timeout: 90_000 });

  test('ofrecen Web Locks y BroadcastChannel', async ({ page }) => {
    await page.goto('/iniciar-sesion');

    expect(await page.evaluate(() => 'locks' in navigator && typeof BroadcastChannel === 'function')).toBe(true);
  });

  test('recargar las dos a la vez, varias veces, no revoca la sesión', async ({ context, page }) => {
    const correo = await createActiveAccount('compat-pestanas');
    await login(page, correo);
    const other = await context.newPage();
    await other.goto('/inicio');
    await expect(other.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    const first = authCalls(page);
    const second = authCalls(other);

    for (let round = 0; round < 3; round += 1) {
      await Promise.all([page.reload(), other.reload()]);
      await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
      await expect(other.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    }

    const calls = [...first, ...second];
    expect(calls.filter((c) => c.path === 'refresh')).toHaveLength(6);
    expect(calls.filter((c) => c.status !== 200)).toEqual([]);
  });

  test('cerrar sesión en una termina la otra, sin recargar y sin solicitudes de más', async ({ context, page }) => {
    const correo = await createActiveAccount('compat-cierre');
    await login(page, correo);
    const other = await context.newPage();
    await other.goto('/inicio');
    await expect(other.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    const calls = authCalls(other);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(page.getByRole('status')).toHaveText(CLOSED);
    await expect(other).toHaveURL(/\/iniciar-sesion$/);
    await expect(other.getByRole('status')).toHaveText(CLOSED);
    expect(calls).toEqual([]);

    await other.reload();
    await expect(other.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(other.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
    expect(calls).toEqual([{ path: 'refresh', status: 401 }]);
  });

  test('una pestaña renueva sobre la cookie que rotó la otra, y las dos siguen dentro', async ({ context, page }) => {
    const correo = await createActiveAccount('compat-rotacion');
    await login(page, correo);
    const other = await context.newPage();
    await other.goto('/inicio');
    await expect(other.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

    await other.reload();
    await expect(other.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('status')).toHaveText(CLOSED);
    await expect(other.getByRole('status')).toHaveText(CLOSED);
  });
});

test.describe('Desafío con el backend real (RN-10; script sustituido, DEC-06)', () => {
  test('cinco fallos muestran el widget, y la respuesta válida entra', async ({ page }) => {
    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `window.turnstile = {
          render(container, options) { options.callback('captcha-de-prueba-valido'); return 'widget'; },
          reset() {}, remove() {},
        };`,
      }),
    );
    const correo = await createActiveAccount('compat-desafio');
    await page.goto('/iniciar-sesion');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const responded = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
      await submitLogin(page, correo, 'contrasena-equivocada');
      expect((await responded).status()).toBe(401);
      // El formulario vacía la contraseña tras el rechazo: rellenarla antes haría perder el siguiente intento.
      await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
    }
    await submitLogin(page, correo);
    await expect(page.getByRole('group', { name: 'Verificación de seguridad' })).toBeAttached();
    await expect(page.getByText('Completa la verificación de seguridad')).toBeVisible();

    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });
});

test('los secretos no quedan en los almacenes ni en la URL tras entrar', async ({ page }) => {
  const correo = await createActiveAccount('compat-secretos');
  const granted = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
  await login(page, correo);
  const { accessToken } = (await (await granted).json()) as { accessToken: string };

  const state = await page.evaluate(() => ({
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
    cookie: document.cookie,
    url: location.href,
    html: document.documentElement.outerHTML,
  }));

  expect(state.local).toBe('{}');
  expect(state.session).toBe('{}');
  const exposed = JSON.stringify(state);
  expect(exposed).not.toContain(accessToken);
  expect(exposed).not.toContain(TEST_PASSWORD);
  expect(exposed).not.toContain('omr_refresh');
});
