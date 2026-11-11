import AxeBuilder from '@axe-core/playwright';
import { expect, request as apiRequest, test, type Page } from '@playwright/test';
import { APP_ORIGIN, uniqueEmail } from './support/env.ts';
import { countMessages, readLink } from './support/mailpit.ts';
import { createActiveAccount, registerAccount, TEST_NAME, TEST_PASSWORD } from './support/test-accounts.ts';
import { expireTokens } from './support/test-db.mjs';

const AUTH = '/api/v1/auth';
const FORGOT = `${AUTH}/password/forgot`;
const RESET = `${AUTH}/password/reset`;
const RESET_PATH = '/restablecer-contrasena';
const NEW_PASSWORD = 'otra-clave-de-prueba-e2e-larga';
const FORGOT_MESSAGE =
  'Si la cuenta puede recuperar su contraseña, te enviamos un enlace. Si aún no verificaste tu correo, solicita un nuevo enlace de verificación.';
const POLICY_ERROR = 'La contraseña debe tener entre 12 y 128 caracteres.';

async function requestLink(page: Page, correo: string, expectedCount = 1): Promise<string> {
  await page.goto('/olvide-contrasena');
  await page.getByLabel('Correo').fill(correo);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('status')).toHaveText(FORGOT_MESSAGE);
  return readLink(correo, RESET_PATH, expectedCount);
}

/** Desde otro documento, como al abrir el enlace del correo. */
async function openLink(page: Page, link: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(link);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

async function savePassword(page: Page, password = NEW_PASSWORD): Promise<void> {
  await page.getByLabel('Nueva contraseña').fill(password);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
}

async function expectLogin(page: Page, correo: string, password: string, entra: boolean): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  if (entra) await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
  else await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
}

async function expectInvalidLink(page: Page): Promise<void> {
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Este enlace ya no sirve');
  await expect(alert).toBeFocused();
  await expect(page.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute('href', '/olvide-contrasena');
  await expect(page.getByLabel('Nueva contraseña')).toHaveCount(0);
}

function watchRequests(page: Page) {
  const seen: { readonly method: string; readonly url: string }[] = [];
  page.on('request', (r) => seen.push({ method: r.method(), url: r.url() }));
  return {
    posts: (path: string) => seen.filter((r) => r.method === 'POST' && r.url.endsWith(path)).length,
    external: () => seen.filter((r) => new URL(r.url).origin !== APP_ORIGIN).map((r) => r.url),
  };
}

test.describe('Recuperación completa con Mailpit (CA-06, RN-06, RN-07)', () => {
  test('con el enlace real cambia la contraseña: la anterior deja de servir y la nueva entra', async ({ page }) => {
    const correo = await createActiveAccount('recupera');
    const requests = watchRequests(page);
    const link = await requestLink(page, correo);

    await openLink(page, link);

    await expect(page).toHaveURL(`${APP_ORIGIN}${RESET_PATH}`);
    await expect(page).toHaveTitle('Crear nueva contraseña · OMR-PreICFES');
    expect(requests.posts(RESET)).toBe(0);
    expect(requests.external()).toEqual([]);

    await savePassword(page);

    const status = page.getByRole('status');
    await expect(status).toHaveText('Tu contraseña se cambió.');
    await expect(status).toBeFocused();
    await page.getByRole('link', { name: 'Ir a Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    expect(requests.posts(RESET)).toBe(1);

    await expectLogin(page, correo, TEST_PASSWORD, false);
    await expectLogin(page, correo, NEW_PASSWORD, true);
  });

  test('recargar deja la pantalla sin enlace, sin gastarlo, y el enlace sigue sirviendo', async ({ page }) => {
    const correo = await createActiveAccount('recarga');
    const link = await requestLink(page, correo);
    const requests = watchRequests(page);
    await openLink(page, link);

    await page.reload();

    await expect(page.getByRole('status')).toContainText('No encontramos un enlace');
    await expect(page.getByRole('link', { name: 'Pedir otro enlace' })).toBeVisible();
    expect(requests.posts(RESET)).toBe(0);

    await openLink(page, link);
    await savePassword(page);
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
  });

  test('un enlace pegado en una pestaña que ya está en la ruta se captura y sale de la URL', async ({ page }) => {
    const correo = await createActiveAccount('misma-pestana');
    const link = await requestLink(page, correo);
    await page.goto(RESET_PATH);
    await expect(page.getByRole('status')).toContainText('No encontramos un enlace');

    await page.goto(link);

    await expect(page.getByLabel('Nueva contraseña')).toBeVisible();
    await expect(page).toHaveURL(`${APP_ORIGIN}${RESET_PATH}`);
    await savePassword(page);
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
  });

  test('cambiarla cierra las sesiones abiertas: la de este navegador y la de otro', async ({ page, browser }) => {
    const correo = await createActiveAccount('revoca');
    const otherContext = await browser.newContext({ baseURL: APP_ORIGIN });
    const other = await otherContext.newPage();
    await expectLogin(other, correo, TEST_PASSWORD, true);
    await expectLogin(page, correo, TEST_PASSWORD, true);
    const api = await apiRequest.newContext({ baseURL: APP_ORIGIN, extraHTTPHeaders: { Origin: APP_ORIGIN } });
    await api.post(FORGOT, { data: { correo } });
    await api.dispose();
    const link = await readLink(correo, RESET_PATH);

    await openLink(page, link);
    await savePassword(page);
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
    await page.getByRole('link', { name: 'Ir a Iniciar sesión' }).click();

    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await other.reload();
    await expect(other).toHaveURL(/\/iniciar-sesion$/);
    await otherContext.close();
  });

  test('un doble clic envía una sola solicitud', async ({ page }) => {
    const correo = await createActiveAccount('doble');
    const link = await requestLink(page, correo);
    const requests = watchRequests(page);
    await openLink(page, link);
    await page.getByLabel('Nueva contraseña').fill(NEW_PASSWORD);

    await page.getByRole('button', { name: 'Guardar contraseña' }).dblclick();

    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
    expect(requests.posts(RESET)).toBe(1);
  });
});

test.describe('Enlaces no válidos, con el rechazo del backend real (CA-06, CA-10)', () => {
  test('un enlace reutilizado', async ({ page }) => {
    const correo = await createActiveAccount('reutilizado');
    const link = await requestLink(page, correo);
    await openLink(page, link);
    await savePassword(page);
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');

    await openLink(page, link);
    const responded = page.waitForResponse((r) => r.url().endsWith(RESET));
    await savePassword(page, 'tercera-clave-de-prueba-larga');

    expect((await responded).status()).toBe(400);
    await expectInvalidLink(page);
    await expectLogin(page, correo, NEW_PASSWORD, true);
  });

  test('un enlace inventado', async ({ page }) => {
    await openLink(page, `${APP_ORIGIN}${RESET_PATH}#token=enlace-inventado`);
    const responded = page.waitForResponse((r) => r.url().endsWith(RESET));

    await savePassword(page);

    expect((await responded).status()).toBe(400);
    await expectInvalidLink(page);
  });

  test('un enlace vencido, con la fecha de vencimiento adelantada solo en la base aislada', async ({ page }) => {
    const correo = await createActiveAccount('vencido');
    const link = await requestLink(page, correo);
    expect(expireTokens(correo, 'RESTABLECER_PASSWORD')).toBe(1);
    await openLink(page, link);
    const responded = page.waitForResponse((r) => r.url().endsWith(RESET));

    await savePassword(page);

    expect((await responded).status()).toBe(400);
    await expectInvalidLink(page);
    await expectLogin(page, correo, TEST_PASSWORD, true);
  });

  test('pedir otro enlace reemplaza el anterior', async ({ page }) => {
    const correo = await createActiveAccount('reemplazado');
    const first = await requestLink(page, correo, 1);
    const second = await requestLink(page, correo, 2);
    expect(second).not.toBe(first);

    await openLink(page, first);
    await savePassword(page);
    await expectInvalidLink(page);

    await openLink(page, second);
    await savePassword(page);
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
  });
});

test.describe('Errores que permiten reintentar sin perder lo escrito (CA-10)', () => {
  test('el 422 real conserva la contraseña escrita y el enlace', async ({ page }) => {
    const correo = await createActiveAccount('politica');
    const link = await requestLink(page, correo);
    await openLink(page, link);
    // La validación local impide enviarla: se cambia en tránsito para obtener la respuesta real del backend.
    await page.route(`**${RESET}`, (route) => {
      const body = route.request().postDataJSON() as { token: string };
      return route.continue({ postData: JSON.stringify({ token: body.token, password: 'corta' }) });
    });
    const responded = page.waitForResponse((r) => r.url().endsWith(RESET));

    await savePassword(page);

    expect((await responded).status()).toBe(422);
    const field = page.getByLabel('Nueva contraseña');
    await expect(page.getByText(POLICY_ERROR)).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(NEW_PASSWORD);

    await page.unroute(`**${RESET}`);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
  });

  test('la validación local no envía una contraseña fuera de la política', async ({ page }) => {
    const requests = watchRequests(page);
    await openLink(page, `${APP_ORIGIN}${RESET_PATH}#token=enlace-de-prueba`);

    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText('Escribe una contraseña de entre 12 y 128 caracteres.')).toBeVisible();
    await savePassword(page, 'corta');
    await expect(page.getByText('La contraseña debe tener entre 12 y 128 caracteres; ahora tiene 5.')).toBeVisible();

    expect(requests.posts(RESET)).toBe(0);
  });

  test('sin red, conserva la contraseña y el enlace, y reintentar funciona', async ({ page }) => {
    const correo = await createActiveAccount('sin-red');
    const link = await requestLink(page, correo);
    await openLink(page, link);
    await page.route(`**${RESET}`, (route) => route.abort());

    await savePassword(page);

    await expect(page.getByRole('alert')).toContainText('No pudimos conectarnos');
    await expect(page.getByLabel('Nueva contraseña')).toHaveValue(NEW_PASSWORD);
    await page.unroute(`**${RESET}`);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
  });

  test('un 429 real al solicitar informa la espera, bloquea el botón y conserva el correo', async ({ page }) => {
    const correo = uniqueEmail('limite');
    await page.goto('/olvide-contrasena');
    await page.getByLabel('Correo').fill(correo);
    const send = page.getByRole('button', { name: 'Enviar enlace' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await send.click();
      await expect(page.getByRole('status')).toHaveText(FORGOT_MESSAGE);
    }
    const limited = page.waitForResponse((r) => r.url().endsWith(FORGOT));

    await send.click();

    expect((await limited).status()).toBe(429);
    await expect(page.getByRole('alert')).toContainText('Podrás intentarlo de nuevo en');
    await expect(page.getByRole('button', { name: 'Espera para reintentar' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByLabel('Correo')).toHaveValue(correo);
  });

  test('un 429 real al guardar conserva la contraseña y no descarta el enlace', async ({ page }) => {
    const correo = await createActiveAccount('limite-enlace');
    const replaced = await requestLink(page, correo, 1);
    await requestLink(page, correo, 2);
    const token = new URLSearchParams(new URL(replaced).hash.slice(1)).get('token');
    const api = await apiRequest.newContext({ baseURL: APP_ORIGIN, extraHTTPHeaders: { Origin: APP_ORIGIN } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await api.post(RESET, { data: { token, password: NEW_PASSWORD } })).status()).toBe(400);
    }
    await api.dispose();
    await openLink(page, replaced);
    const limited = page.waitForResponse((r) => r.url().endsWith(RESET));

    await savePassword(page);

    expect((await limited).status()).toBe(429);
    await expect(page.getByRole('alert')).toContainText('Podrás intentarlo de nuevo en');
    await expect(page.getByRole('button', { name: 'Espera para reintentar' })).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByLabel('Nueva contraseña')).toHaveValue(NEW_PASSWORD);
  });
});

test.describe('Mensajes públicos y seguridad (RN-02, RN-05, RN-07, RN-11)', () => {
  test('el mensaje es el mismo para una cuenta activa, una sin verificar y un correo inexistente', async ({ page }) => {
    const activa = await createActiveAccount('activa');
    const sinVerificar = await registerAccount('sin-verificar');
    const inexistente = uniqueEmail('no-existe');
    const messages: string[] = [];
    const statuses: number[] = [];

    for (const correo of [activa, sinVerificar, inexistente]) {
      await page.goto('/olvide-contrasena');
      await page.getByLabel('Correo').fill(correo);
      const responded = page.waitForResponse((r) => r.url().endsWith(FORGOT));
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      statuses.push((await responded).status());
      messages.push(await page.getByRole('status').innerText());
    }

    expect(statuses).toEqual([202, 202, 202]);
    expect(new Set(messages)).toEqual(new Set([FORGOT_MESSAGE]));
    await readLink(activa, RESET_PATH);
    expect(await countMessages(inexistente)).toBe(0);
  });

  test('ni el token ni las contraseñas aparecen en consola, almacenes, historial, página o URL', async ({ page, context }) => {
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));
    page.on('pageerror', (error) => logs.push(error.message));
    const correo = await createActiveAccount('secretos');
    const link = await requestLink(page, correo);
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token') ?? '';
    expect(token).not.toBe('');

    const inspect = () =>
      page.evaluate(() => ({
        url: location.href,
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
        cookie: document.cookie,
        history: JSON.stringify(history.state),
        text: document.body.innerText,
      }));

    await openLink(page, link);
    const opened = await inspect();
    await savePassword(page);
    await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
    const finished = await inspect();

    for (const state of [opened, finished]) {
      expect(state.local).toBe('{}');
      expect(state.session).toBe('{}');
      expect(state.url).toBe(`${APP_ORIGIN}${RESET_PATH}`);
    }
    const exposed = `${JSON.stringify([opened, finished])} ${logs.join(' ')} ${(await page.content())}`;
    expect(exposed).not.toContain(token);
    expect(exposed).not.toContain(NEW_PASSWORD);
    expect((await context.cookies()).map((c) => c.value).join(' ')).not.toContain(token);
  });

  test('la solicitud lleva Origin, y el token viaja solo en el cuerpo', async ({ page }) => {
    await openLink(page, `${APP_ORIGIN}${RESET_PATH}#token=enlace-en-el-cuerpo`);
    const sent = page.waitForRequest((r) => r.url().endsWith(RESET));

    await savePassword(page);

    const request = await sent;
    expect(request.url()).toBe(`${APP_ORIGIN}${RESET}`);
    expect(request.postDataJSON()).toEqual({ token: 'enlace-en-el-cuerpo', password: NEW_PASSWORD });
    expect((await request.allHeaders())['origin']).toBe(APP_ORIGIN);
  });
});

test.describe('Teclado, accesibilidad y adaptación (CA-12, RNF-01)', () => {
  test('la solicitud y el cambio se completan solo con teclado', async ({ page }) => {
    const correo = await createActiveAccount('teclado');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/olvide-contrasena');
    await expect(page.getByLabel('Correo')).toBeVisible();
    // Sin barra de trámites, el primer Tab llega al primer campo; los enlaces secundarios van después del botón.
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Correo')).toBeFocused();
    await page.keyboard.type(correo);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toBeFocused();
    const link = await readLink(correo, RESET_PATH);

    await openLink(page, link);
    // Mientras llega el módulo diferido solo existe el título de la pantalla de espera.
    await expect(page.getByLabel('Nueva contraseña')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Nueva contraseña')).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Mostrar contraseña' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Guardar contraseña' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('status')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Ir a Iniciar sesión' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
  });

  const WIDTHS = [375, 640, 1280] as const;

  const STATES: Readonly<Record<string, (page: Page) => Promise<void>>> = {
    'solicitud vacía': async (page) => {
      await page.goto('/olvide-contrasena');
      await expect(page.getByLabel('Correo')).toBeVisible();
    },
    'solicitud con error de campo': async (page) => {
      await page.goto('/olvide-contrasena');
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      await expect(page.getByText('Escribe tu correo.')).toBeVisible();
    },
    'solicitud enviada': async (page) => {
      await page.goto('/olvide-contrasena');
      await page.getByLabel('Correo').fill(uniqueEmail('axe'));
      await page.getByRole('button', { name: 'Enviar enlace' }).click();
      await expect(page.getByRole('status')).toHaveText(FORGOT_MESSAGE);
    },
    'nueva contraseña': async (page) => {
      await openLink(page, `${APP_ORIGIN}${RESET_PATH}#token=enlace-de-prueba`);
      await expect(page.getByLabel('Nueva contraseña')).toBeVisible();
    },
    'nueva contraseña con error': async (page) => {
      await openLink(page, `${APP_ORIGIN}${RESET_PATH}#token=enlace-de-prueba`);
      await savePassword(page, 'corta');
      await expect(page.getByText(/ahora tiene 5/)).toBeVisible();
    },
    'enlace no válido': async (page) => {
      await openLink(page, `${APP_ORIGIN}${RESET_PATH}#token=enlace-de-prueba`);
      await savePassword(page);
      await expect(page.getByRole('alert')).toBeVisible();
    },
    'sin enlace': async (page) => {
      await page.goto(RESET_PATH);
      await expect(page.getByRole('status')).toBeVisible();
    },
    'contraseña cambiada': async (page) => {
      const correo = await createActiveAccount('axe');
      await openLink(page, await requestLink(page, correo));
      await savePassword(page);
      await expect(page.getByRole('status')).toHaveText('Tu contraseña se cambió.');
    },
  };

  for (const [name, reach] of Object.entries(STATES)) {
    for (const width of WIDTHS) {
      test(`${name} a ${width} px: sin violaciones de axe ni desbordes`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });

        await reach(page);
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${v.id}: ${v.impact}`)).toEqual([]);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        if (width !== 640) {
          await page.screenshot({ path: testInfo.outputPath(`${name.replaceAll(' ', '-')}-${width}.png`), fullPage: true });
        }
      });
    }
  }
});
