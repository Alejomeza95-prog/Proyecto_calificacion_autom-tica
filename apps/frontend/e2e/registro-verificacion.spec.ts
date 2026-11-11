import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { APP_ORIGIN, uniqueEmail } from './support/env.ts';
import { countMessages, readLink } from './support/mailpit.ts';

const AUTH = '/api/v1/auth';
const REGISTER = `${AUTH}/register`;
const VERIFY = `${AUTH}/verify-email`;
const VERIFY_PATH = '/verificar-correo';
/** Solo para cuentas `@example.test` de la base aislada. */
const PASSWORD = 'clave-de-prueba-e2e-larga';
const NOMBRE = 'Persona de prueba';

const BACKEND_REGISTER_MESSAGE = 'Si el correo puede registrarse, te enviamos un enlace de verificación.';
const BACKEND_RESEND_MESSAGE = 'Si el correo tiene una verificación pendiente, te enviamos un nuevo enlace.';

async function fillAndRegister(page: Page, correo: string): Promise<void> {
  await page.goto('/registro');
  await page.getByLabel('Nombre').fill(NOMBRE);
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page).toHaveURL(/\/revisa-tu-correo$/);
}

function watchRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return {
    urls,
    to: (path: string) => urls.filter((url) => url.endsWith(path)),
    external: () => urls.filter((url) => new URL(url).origin !== APP_ORIGIN),
  };
}

async function loginViaApi(page: Page, correo: string, password: string) {
  return page.evaluate(
    async ([url, email, secret]) => {
      const response = await fetch(url as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: email, password: secret }),
      });
      return { status: response.status, body: (await response.json()) as unknown };
    },
    [`${AUTH}/login`, correo, password],
  );
}

test.describe('Registro (CA-02, CA-03, RN-04)', () => {
  test('envía solo nombre, correo y contraseña, con Origin permitido, y lleva a Revisa tu correo', async ({ page }) => {
    await page.goto('/registro');
    await expect(page.getByLabel(/rol|instituci/i)).toHaveCount(0);
    await expect(page.locator('form input')).toHaveCount(3);
    const correo = uniqueEmail('registro');
    const sent = page.waitForRequest((r) => r.url().endsWith(REGISTER));

    await page.getByLabel('Nombre').fill(NOMBRE);
    await page.getByLabel('Correo').fill(correo);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    const request = await sent;
    expect(Object.keys(request.postDataJSON() as object).sort()).toEqual(['correo', 'nombre', 'password']);
    expect((await request.allHeaders())['origin']).toBe(APP_ORIGIN);
    await expect(page).toHaveURL(/\/revisa-tu-correo$/);
    const status = page.getByRole('status');
    await expect(status).toHaveText(BACKEND_REGISTER_MESSAGE);
    await expect(status).toBeFocused();
  });

  test('el 422 real del backend mantiene su contrato', async ({ page }) => {
    await page.goto('/registro');

    const result = await page.evaluate(
      async ([url, correo]) => {
        const response = await fetch(url as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: 'N', correo, password: 'corta' }),
        });
        return { status: response.status, body: (await response.json()) as { type: string; errores: { campo: string }[] } };
      },
      [REGISTER, uniqueEmail('politica')],
    );

    expect(result.status).toBe(422);
    expect(result.body.type).toBe('urn:omr-preicfes:problema:politica-password');
    expect(result.body.errores.map((e) => e.campo)).toEqual(['password']);
  });

  test('la validación local evita enviar datos inválidos', async ({ page }) => {
    const requests = watchRequests(page);
    await page.goto('/registro');

    await page.getByLabel('Nombre').fill(NOMBRE);
    await page.getByLabel('Correo').fill('no-es-correo');
    await page.getByLabel('Contraseña', { exact: true }).fill('a'.repeat(11));
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByLabel('Correo')).toBeFocused();
    await expect(page.getByLabel('Correo')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/ahora tiene 11/)).toBeVisible();
    expect(requests.to(REGISTER)).toEqual([]);
  });

  test('admite pegar la contraseña (RNF-02)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/registro');
    const input = page.getByLabel('Contraseña', { exact: true });
    await page.evaluate((value) => navigator.clipboard.writeText(value), PASSWORD);

    await input.focus();
    await page.keyboard.press('Control+V');

    await expect(input).toHaveValue(PASSWORD);
  });
});

test.describe('Verificación con enlace real de Mailpit (CA-04, CA-05, RN-06, RN-07, RN-09)', () => {
  test('abrir no consume; confirmar verifica y explica la aprobación pendiente', async ({ page }) => {
    const correo = uniqueEmail('verifica');
    await fillAndRegister(page, correo);
    const link = await readLink(correo, VERIFY_PATH);
    const requests = watchRequests(page);

    await page.goto(link);

    await expect(page.getByRole('button', { name: 'Confirmar mi correo' })).toBeVisible();
    expect(page.url()).toBe(`${APP_ORIGIN}${VERIFY_PATH}`);
    expect(await page.evaluate(() => window.location.hash)).toBe('');
    expect(requests.to(VERIFY)).toEqual([]);
    // Las rutas con token no consultan la sesión (plan §2.4).
    expect(requests.to(`${AUTH}/refresh`)).toEqual([]);
    expect(requests.external()).toEqual([]);

    const sent = page.waitForRequest((r) => r.url().endsWith(VERIFY));
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();

    const request = await sent;
    expect(Object.keys(request.postDataJSON() as object)).toEqual(['token']);
    expect(request.url()).not.toContain('token');
    const headers = await request.allHeaders();
    expect(headers['origin']).toBe(APP_ORIGIN);
    expect(headers['referer']).toBeUndefined();

    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');
    await expect(page.getByText(/un administrador debe aprobar tu cuenta/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir a Iniciar sesión' })).toHaveCount(0);
    expect(requests.external()).toEqual([]);
  });

  test('la cuenta pendiente recibe el mismo rechazo genérico que cualquier otra', async ({ page }) => {
    const correo = uniqueEmail('pendiente');
    await fillAndRegister(page, correo);
    await page.goto(await readLink(correo, VERIFY_PATH));
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');

    const pending = await loginViaApi(page, correo, PASSWORD);
    const unknown = await loginViaApi(page, uniqueEmail('inexistente'), PASSWORD);

    expect(pending.status).toBe(401);
    expect(pending).toEqual(unknown);
  });

  test('recargar tras limpiar la URL deja sin enlace, sin consumirlo, y el enlace sigue sirviendo', async ({ page }) => {
    const correo = uniqueEmail('recarga');
    await fillAndRegister(page, correo);
    const link = await readLink(correo, VERIFY_PATH);
    await page.goto(link);
    await expect(page.getByRole('button', { name: 'Confirmar mi correo' })).toBeVisible();

    await page.reload();

    await expect(page.getByText(/Ábrelo de nuevo desde tu correo/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar mi correo' })).toHaveCount(0);

    await page.goto('about:blank');
    await page.goto(link);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');
  });

  test('un enlace usado ofrece Reenviar verificación', async ({ page }) => {
    const correo = uniqueEmail('usado');
    await fillAndRegister(page, correo);
    const link = await readLink(correo, VERIFY_PATH);
    await page.goto(link);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');

    await page.goto('about:blank');
    await page.goto(link);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Este enlace ya no sirve');
    await expect(alert).toBeFocused();
    await page.getByRole('link', { name: 'Reenviar verificación' }).click();
    await expect(page).toHaveURL(/\/reenviar-verificacion$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  });

  test('pedir otro enlace envía un correo nuevo y reemplaza el anterior', async ({ page }) => {
    const correo = uniqueEmail('reenvio');
    await fillAndRegister(page, correo);
    const oldLink = await readLink(correo, VERIFY_PATH);

    await page.getByRole('button', { name: 'Pedir otro enlace' }).click();
    await expect(page.getByRole('status')).toHaveText(BACKEND_RESEND_MESSAGE);
    const newLink = await readLink(correo, VERIFY_PATH, 2);
    expect(newLink).not.toBe(oldLink);

    await page.goto(oldLink);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByRole('alert')).toContainText('Este enlace ya no sirve');

    await page.goto('about:blank');
    await page.goto(newLink);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');
  });

  test('Revisa tu correo tras recargar no conserva el correo y ofrece reenviar', async ({ page }) => {
    const correo = uniqueEmail('olvido');
    await fillAndRegister(page, correo);
    await expect(page.getByText(correo)).toBeVisible();

    await page.reload();

    await expect(page.getByText(correo)).toHaveCount(0);
    await page.getByRole('link', { name: 'Reenviar verificación' }).click();
    await expect(page.getByLabel('Correo')).toHaveValue('');
  });
});

test.describe('Mensajes públicos (RN-05) y límites (CA-10)', () => {
  test('registrar un correo ya usado muestra el mismo mensaje y no revela la cuenta', async ({ page }) => {
    const repeated = uniqueEmail('repetido');
    await fillAndRegister(page, repeated);
    const first = await page.getByRole('status').innerText();

    await fillAndRegister(page, repeated);
    const again = await page.getByRole('status').innerText();
    await fillAndRegister(page, uniqueEmail('nuevo'));
    const fresh = await page.getByRole('status').innerText();

    expect(again).toBe(first);
    expect(fresh).toBe(first);
  });

  test('reenviar da el mismo mensaje para un correo existente o inexistente', async ({ page }) => {
    const existing = uniqueEmail('existe');
    await fillAndRegister(page, existing);
    const messages: string[] = [];

    for (const correo of [existing, uniqueEmail('no-existe')]) {
      await page.goto('/reenviar-verificacion');
      await page.getByLabel('Correo').fill(correo);
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      messages.push(await page.getByRole('status').innerText());
    }

    expect(messages).toEqual([BACKEND_RESEND_MESSAGE, BACKEND_RESEND_MESSAGE]);
    expect(await countMessages(existing)).toBeGreaterThanOrEqual(1);
  });

  test('un 429 real informa la espera y bloquea el botón', async ({ page }) => {
    const correo = uniqueEmail('limite');
    await page.goto('/reenviar-verificacion');
    await page.getByLabel('Correo').fill(correo);
    const send = page.getByRole('button', { name: 'Enviar enlace' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await send.click();
      await expect(page.getByRole('status')).toHaveText(BACKEND_RESEND_MESSAGE);
    }
    const limited = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/resend-verification`));
    await send.click();

    expect((await limited).status()).toBe(429);
    await expect(page.getByRole('alert')).toContainText('Podrás intentarlo de nuevo en');
    await expect(page.getByRole('button', { name: 'Espera para reintentar' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByLabel('Correo')).toHaveValue(correo);
  });
});

test.describe('Seguridad del flujo (RN-02, RN-07, RN-11)', () => {
  test('ni la contraseña ni el token aparecen en consola, almacenes, cookies legibles o URL', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));
    page.on('pageerror', (error) => logs.push(error.message));
    const correo = uniqueEmail('secretos');

    await fillAndRegister(page, correo);
    const link = await readLink(correo, VERIFY_PATH);
    const token = decodeURIComponent(new URL(link).hash.replace('#token=', ''));
    await page.goto(link);
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');

    const stored = await page.evaluate(async () => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      cookie: document.cookie,
      history: JSON.stringify(history.state),
      databases: (await indexedDB.databases()).length,
      url: location.href,
    }));

    expect(stored.databases).toBe(0);
    expect(stored.local).toBe('{}');
    expect(stored.session).toBe('{}');
    expect(stored.cookie).toBe('');
    const exposed = `${JSON.stringify(stored)} ${logs.join(' ')} ${await page.content()}`;
    expect(exposed).not.toContain(PASSWORD);
    expect(exposed).not.toContain(token);
  });

  test('la página declara la política de referente, y el bundle no carga nada externo', async ({ page }) => {
    const requests = watchRequests(page);

    await page.goto(`${VERIFY_PATH}#token=enlace-de-prueba`);
    await expect(page.getByRole('button', { name: 'Confirmar mi correo' })).toBeVisible();

    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    expect(requests.external()).toEqual([]);
  });
});

test.describe('Teclado y accesibilidad (CA-12, RNF-01)', () => {
  test('el registro se completa solo con teclado', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/registro');
    await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeVisible();

    // Sin barra de trámites, el primer Tab llega al primer campo; «Iniciar sesión» va después del botón.
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Nombre')).toBeFocused();
    await page.keyboard.type(NOMBRE);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Correo')).toBeFocused();
    await page.keyboard.type(uniqueEmail('teclado'));
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/revisa-tu-correo$/);
    await expect(page.getByRole('status')).toBeFocused();
  });

  const WIDTHS = [375, 640, 1280] as const;

  async function expectAccessible(page: Page): Promise<void> {
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.impact}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }

  const STATES: Readonly<Record<string, (page: Page) => Promise<void>>> = {
    'registro vacío': async (page) => {
      await page.goto('/registro');
      await expect(page.getByRole('button', { name: 'Crear cuenta' })).toBeVisible();
    },
    'registro con errores': async (page) => {
      await page.goto('/registro');
      await page.getByRole('button', { name: 'Crear cuenta' }).click();
      await expect(page.getByText('Escribe tu nombre.')).toBeVisible();
    },
    'revisa tu correo con mensaje': async (page) => {
      await fillAndRegister(page, uniqueEmail('axe'));
      await expect(page.getByRole('status')).toBeVisible();
    },
    'revisa tu correo tras recargar': async (page) => {
      await page.goto('/revisa-tu-correo');
      await expect(page.getByRole('link', { name: 'Reenviar verificación' })).toBeVisible();
    },
    'reenviar con mensaje': async (page) => {
      await page.goto('/reenviar-verificacion');
      await page.getByLabel('Correo').fill(uniqueEmail('axe'));
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      await expect(page.getByRole('status')).toBeVisible();
    },
    'verificar listo': async (page) => {
      await page.goto(`${VERIFY_PATH}#token=enlace-de-prueba`);
      await expect(page.getByRole('button', { name: 'Confirmar mi correo' })).toBeVisible();
    },
    'verificar sin enlace': async (page) => {
      await page.goto(VERIFY_PATH);
      await expect(page.getByRole('status')).toBeVisible();
    },
    'enlace no válido': async (page) => {
      await page.goto(`${VERIFY_PATH}#token=enlace-de-prueba`);
      await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
    },
    'correo verificado': async (page) => {
      const correo = uniqueEmail('axe');
      await fillAndRegister(page, correo);
      await page.goto(await readLink(correo, VERIFY_PATH));
      await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
      await expect(page.getByRole('status')).toBeVisible();
    },
  };

  for (const [name, reach] of Object.entries(STATES)) {
    for (const width of WIDTHS) {
      test(`${name} a ${width} px: sin violaciones de axe ni desbordes`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });

        await reach(page);
        await page.evaluate(() => document.fonts.ready);
        await expectAccessible(page);

        if (width !== 640) {
          await page.screenshot({
            path: testInfo.outputPath(`${name.replaceAll(' ', '-')}-${width}.png`),
            fullPage: true,
          });
        }
      });
    }
  }
});
