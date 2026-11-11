import AxeBuilder from '@axe-core/playwright';
import { expect, request as apiRequest, test, type Page } from '@playwright/test';
import { ACTIVATION_ORIGIN, APP_ORIGIN, uniqueEmail } from './support/env.ts';
import { readLink } from './support/mailpit.ts';
import { expireTokens, runBootstrapAdmin, startActivationBackend } from './support/test-db.mjs';

const AUTH = '/api/v1/auth';
const ACTIVATE = `${AUTH}/activate`;
const RESET = `${AUTH}/password/reset`;
const ACTIVATE_PATH = '/activar-cuenta';
const NOMBRE = 'Admin de prueba';
const PASSWORD = 'clave-de-activacion-e2e-larga';
const RECOVERY_WORDING = /recuper|restablec|olvid/i;

async function openLink(page: Page, link: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activar cuenta');
}

async function activate(page: Page, password = PASSWORD): Promise<void> {
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
}

/** Pide un enlace nuevo con el comando real y devuelve el del correo número `count`. */
function issueLink(database: string, correo: string, count: number): Promise<string> {
  runBootstrapAdmin(database, NOMBRE, correo);
  return readLink(correo, ACTIVATE_PATH, count);
}

async function expectNoRecoveryOffer(page: Page): Promise<void> {
  await expect(page.locator('body')).not.toHaveText(RECOVERY_WORDING);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.locator('a[href="/olvide-contrasena"], a[href="/restablecer-contrasena"]')).toHaveCount(0);
}

async function expectInvalidLink(page: Page): Promise<void> {
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Este enlace de activación ya no sirve');
  await expect(alert).toContainText('Pide uno nuevo a quien opera el sistema');
  await expect(alert).toBeFocused();
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);
  await expectNoRecoveryOffer(page);
}

/**
 * Backend y `bootstrap:admin` reales, con Mailpit (CA-14, RN-15, DEC-11). En orden: esa base admite una sola cuenta
 * inicial, y la activación que termina con éxito va al final porque después el comando ya no emite enlaces.
 */
test.describe('Activación con el enlace real de bootstrap:admin', () => {
  test.describe.configure({ mode: 'serial' });

  const correo = uniqueEmail('activacion');
  let database = '';
  let link = '';
  let replacedLink = '';

  test.beforeAll(() => {
    test.setTimeout(240_000);
    database = startActivationBackend();
  });

  test('abrir no consume: la URL queda limpia, sin recursos externos ni textos de recuperación', async ({ page }) => {
    replacedLink = await issueLink(database, correo, 1);
    const external: string[] = [];
    const posts: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).origin !== ACTIVATION_ORIGIN && !r.url().startsWith('about:')) external.push(r.url());
      if (r.method() === 'POST' && (r.url().endsWith(ACTIVATE) || r.url().endsWith(RESET))) posts.push(r.url());
    });

    await openLink(page, replacedLink);

    await expect(page).toHaveURL(`${ACTIVATION_ORIGIN}${ACTIVATE_PATH}`);
    await expect(page).toHaveTitle('Activar cuenta · OMR-PreICFES');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
    await expectNoRecoveryOffer(page);
    expect(posts).toEqual([]);
    expect(external).toEqual([]);
  });

  test('recargar deja la pantalla sin enlace, indica a quién pedirlo y no remite a la recuperación', async ({ page }) => {
    await openLink(page, replacedLink);

    await page.reload();

    await expect(page.getByRole('status')).toContainText('pide uno nuevo a quien opera el sistema');
    await expectNoRecoveryOffer(page);
  });

  test('un enlace inventado: 400 real, sin remitir a la recuperación', async ({ page }) => {
    await openLink(page, `${ACTIVATION_ORIGIN}${ACTIVATE_PATH}#token=enlace-inventado`);
    const responded = page.waitForResponse((r) => r.url().endsWith(ACTIVATE));

    await activate(page);

    expect((await responded).status()).toBe(400);
    await expectInvalidLink(page);
  });

  test('un enlace reemplazado por otro más reciente: 400 real', async ({ page }) => {
    link = await issueLink(database, correo, 2);
    expect(link).not.toBe(replacedLink);
    await openLink(page, replacedLink);
    const responded = page.waitForResponse((r) => r.url().endsWith(ACTIVATE));

    await activate(page);

    expect((await responded).status()).toBe(400);
    await expectInvalidLink(page);
  });

  test('un enlace vencido, con la fecha de vencimiento adelantada solo en la base aislada: 400 real', async ({ page }) => {
    expect(expireTokens(correo, 'ACTIVAR_CUENTA', database)).toBe(1);
    await openLink(page, link);
    const responded = page.waitForResponse((r) => r.url().endsWith(ACTIVATE));

    await activate(page);

    expect((await responded).status()).toBe(400);
    await expectInvalidLink(page);
  });

  test('un 422 real conserva la contraseña y el enlace', async ({ page }) => {
    link = await issueLink(database, correo, 3);
    await openLink(page, link);
    // La validación local impide enviarla: se cambia en tránsito para obtener la respuesta real del backend.
    await page.route(`**${ACTIVATE}`, (route) => {
      const body = route.request().postDataJSON() as { token: string };
      return route.continue({ postData: JSON.stringify({ token: body.token, password: 'corta' }) });
    });
    const responded = page.waitForResponse((r) => r.url().endsWith(ACTIVATE));

    await activate(page);

    expect((await responded).status()).toBe(422);
    const field = page.getByLabel('Contraseña', { exact: true });
    await expect(page.getByText('La contraseña debe tener entre 12 y 128 caracteres.')).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(PASSWORD);
  });

  test('un 429 real informa la espera, bloquea el botón y conserva la contraseña', async ({ page }) => {
    const token = new URLSearchParams(new URL(replacedLink).hash.slice(1)).get('token');
    const api = await apiRequest.newContext({ baseURL: ACTIVATION_ORIGIN, extraHTTPHeaders: { Origin: ACTIVATION_ORIGIN } });
    // El enlace reemplazado ya recibió un intento en la prueba anterior; el límite por token es de cinco.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await api.post(ACTIVATE, { data: { token, password: PASSWORD } })).status()).toBe(400);
    }
    await api.dispose();
    await openLink(page, replacedLink);
    const limited = page.waitForResponse((r) => r.url().endsWith(ACTIVATE));

    await activate(page);

    expect((await limited).status()).toBe(429);
    await expect(page.getByRole('alert')).toContainText('Podrás intentarlo de nuevo en');
    await expect(page.getByRole('button', { name: 'Espera para reintentar' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(PASSWORD);
  });

  test('confirmar activa la cuenta sin iniciar sesión, con una solicitud a /activate, y luego se puede entrar', async ({ page, context }) => {
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));
    page.on('pageerror', (error) => logs.push(error.message));
    const posts: { readonly url: string; readonly body: unknown }[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST') posts.push({ url: r.url(), body: r.postDataJSON() as unknown });
    });
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token') ?? '';
    await openLink(page, link);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);

    await page.getByRole('button', { name: 'Activar mi cuenta' }).dblclick();

    const status = page.getByRole('status');
    await expect(status).toHaveText('Tu cuenta quedó activada.');
    await expect(status).toBeFocused();
    await expectNoRecoveryOffer(page);
    const activations = posts.filter((p) => p.url.endsWith(ACTIVATE));
    expect(activations).toEqual([{ url: `${ACTIVATION_ORIGIN}${ACTIVATE}`, body: { token, password: PASSWORD } }]);
    expect(posts.filter((p) => p.url.endsWith(RESET))).toEqual([]);
    expect((await context.cookies()).filter((c) => c.name === 'omr_refresh')).toEqual([]);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.impact}`)).toEqual([]);
    const state = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      url: location.href,
    }));
    expect(state).toEqual({ local: '{}', session: '{}', url: `${ACTIVATION_ORIGIN}${ACTIVATE_PATH}` });
    const exposed = `${logs.join(' ')} ${await page.content()}`;
    expect(exposed).not.toContain(token);
    expect(exposed).not.toContain(PASSWORD);

    await page.getByRole('link', { name: 'Ir a Iniciar sesión' }).click();
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page).toHaveURL(`${ACTIVATION_ORIGIN}/inicio`);
    await expect(page.getByText(`Hola, ${NOMBRE}.`)).toBeVisible();
    await expect(page.getByText('Tu rol: Administrador')).toBeVisible();
  });

  test('un enlace reutilizado: 400 real, sin remitir a la recuperación', async ({ page }) => {
    await openLink(page, link);
    const responded = page.waitForResponse((r) => r.url().endsWith(ACTIVATE));

    await activate(page, 'otra-clave-de-activacion-larga');

    expect((await responded).status()).toBe(400);
    await expectInvalidLink(page);
  });
});

test.describe('Errores que permiten reintentar (CA-10)', () => {
  test('la validación local no envía una contraseña fuera de la política', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith(ACTIVATE)) posts.push(r.url());
    });
    await openLink(page, `${APP_ORIGIN}${ACTIVATE_PATH}#token=enlace-de-prueba`);

    await page.getByRole('button', { name: 'Activar mi cuenta' }).click();
    await expect(page.getByText('Escribe una contraseña de entre 12 y 128 caracteres.')).toBeVisible();
    await activate(page, 'corta');
    await expect(page.getByText(/ahora tiene 5/)).toBeVisible();

    expect(posts).toEqual([]);
  });

  test('sin red, conserva la contraseña y permite reintentar', async ({ page }) => {
    await openLink(page, `${APP_ORIGIN}${ACTIVATE_PATH}#token=enlace-de-prueba`);
    await page.route(`**${ACTIVATE}`, (route) => route.abort());

    await activate(page);

    await expect(page.getByRole('alert')).toContainText('No pudimos conectarnos');
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(PASSWORD);
    await expect(page.getByRole('button', { name: 'Activar mi cuenta' })).toBeEnabled();
  });
});

test.describe('Teclado, accesibilidad y adaptación (CA-12, RNF-01)', () => {
  test('se completa solo con teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openLink(page, `${APP_ORIGIN}${ACTIVATE_PATH}#token=enlace-de-prueba`);
    // Mientras llega el módulo diferido solo existe el título de la pantalla de espera.
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');

    await expect(page.getByRole('alert')).toBeFocused();
  });

  const WIDTHS = [375, 640, 1280] as const;

  const STATES: Readonly<Record<string, (page: Page) => Promise<void>>> = {
    formulario: async (page) => {
      await openLink(page, `${APP_ORIGIN}${ACTIVATE_PATH}#token=enlace-de-prueba`);
      await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
    },
    'con error de campo': async (page) => {
      await openLink(page, `${APP_ORIGIN}${ACTIVATE_PATH}#token=enlace-de-prueba`);
      await activate(page, 'corta');
      await expect(page.getByText(/ahora tiene 5/)).toBeVisible();
    },
    'enlace no válido': async (page) => {
      await openLink(page, `${APP_ORIGIN}${ACTIVATE_PATH}#token=enlace-de-prueba`);
      await activate(page);
      await expect(page.getByRole('alert')).toBeVisible();
    },
    'sin enlace': async (page) => {
      await page.goto(ACTIVATE_PATH);
      await expect(page.getByRole('status')).toBeVisible();
    },
    // Solo revisa cómo se ve el resultado, con respuesta simulada; la activación real está en la serie de arriba.
    'cuenta activada': async (page) => {
      await page.route(`**${ACTIVATE}`, (route) => route.fulfill({ status: 204 }));
      await openLink(page, `${APP_ORIGIN}${ACTIVATE_PATH}#token=enlace-de-prueba`);
      await activate(page);
      await expect(page.getByRole('status')).toHaveText('Tu cuenta quedó activada.');
    },
  };

  for (const [name, reach] of Object.entries(STATES)) {
    for (const width of WIDTHS) {
      test(`activación, ${name}, a ${width} px: sin violaciones de axe ni desbordes`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });

        await reach(page);
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${v.id}: ${v.impact}`)).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        if (width !== 640) {
          await page.screenshot({ path: testInfo.outputPath(`activacion-${name.replaceAll(' ', '-')}-${width}.png`), fullPage: true });
        }
      });
    }
  }
});
