import AxeBuilder from '@axe-core/playwright';
import { expect, request, test, type Page, type Route } from '@playwright/test';
import { APP_ORIGIN, uniqueEmail } from './support/env.ts';
import { readLink } from './support/mailpit.ts';
import { createActiveAccount, registerAccount, TEST_NAME, TEST_PASSWORD, updateAccount } from './support/test-accounts.ts';

const AUTH = '/api/v1/auth';
const GUIDANCE = '¿No puedes entrar? Si acabas de crear tu cuenta, confirma tu correo; algunas cuentas necesitan la aprobación de un administrador.';
const CAPTCHA_OK = 'captcha-de-prueba-valido';
const TURNSTILE = 'https://challenges.cloudflare.com/**';

async function submitLogin(page: Page, correo: string, password = TEST_PASSWORD): Promise<void> {
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function loginThroughUi(page: Page, correo: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await submitLogin(page, correo);
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
}

function countRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(`${r.method()} ${new URL(r.url()).pathname}`));
  return {
    seen,
    count: (method: string, path: string) => seen.filter((entry) => entry === `${method} ${AUTH}${path}`).length,
  };
}

function problemResponse(route: Route, status: number, kind: string) {
  return route.fulfill({
    status,
    contentType: 'application/problem+json; charset=utf-8',
    body: JSON.stringify({ type: `urn:omr-preicfes:problema:${kind}`, title: 'Título', status }),
  });
}

/** Sustituye el script externo (DEC-06). El backend, con su adaptador `test`, sigue validando la respuesta. */
async function stubTurnstile(page: Page, token: string = CAPTCHA_OK) {
  await page.route(TURNSTILE, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        window.__turnstile = { options: [], resets: 0, removes: 0 };
        window.turnstile = {
          render(container, options) {
            window.__turnstile.options.push({ sitekey: options.sitekey, action: options.action });
            window.__turnstile.callback = options.callback;
            container.textContent = 'Verificación simulada';
            options.callback(${JSON.stringify(token)});
            return 'widget';
          },
          reset() {
            window.__turnstile.resets += 1;
            window.__turnstile.callback(${JSON.stringify(token)});
          },
          remove() { window.__turnstile.removes += 1; },
        };`,
    }),
  );
}

async function failLogins(page: Page, correo: string, times: number): Promise<void> {
  for (let attempt = 0; attempt < times; attempt += 1) {
    const responded = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
    await submitLogin(page, correo, 'contrasena-equivocada');
    expect((await responded).status()).toBe(401);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).not.toHaveAttribute('aria-disabled', 'true');
  }
}

test.describe('Inicio y cierre de sesión reales (CA-01, CA-07, CA-08)', () => {
  test('entra, muestra los datos de /me, conserva la sesión al recargar y la cierra', async ({ page, context }) => {
    const correo = await createActiveAccount('sesion');
    const sent = page.waitForRequest((r) => r.url().endsWith(`${AUTH}/login`));

    await loginThroughUi(page, correo);

    const request = await sent;
    expect(request.postDataJSON()).toEqual({ correo, password: TEST_PASSWORD });
    expect((await request.allHeaders())['origin']).toBe(APP_ORIGIN);
    await expect(page.getByText('Tu rol: Administrador')).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);

    const requests = countRequests(page);
    await page.reload();
    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
    await expect(page).toHaveURL(/\/inicio$/);
    expect(requests.count('POST', '/refresh')).toBe(1);
    expect(requests.count('GET', '/me')).toBe(1);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    const closed = page.getByRole('status');
    await expect(closed).toHaveText('Tu sesión se cerró.');
    await expect(closed).toBeFocused();
    expect((await context.cookies()).filter((c) => c.name === 'omr_refresh')).toEqual([]);

    await page.goto('/inicio');
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  });

  test('ni la contraseña ni el JWT quedan en almacenes, consola, página o URL (RN-02, RN-03, RN-11)', async ({ page, context }) => {
    const logs: string[] = [];
    page.on('console', (message) => logs.push(message.text()));
    page.on('pageerror', (error) => logs.push(error.message));
    const correo = await createActiveAccount('secretos');
    const granted = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));

    await loginThroughUi(page, correo);
    const { accessToken } = (await (await granted).json()) as { accessToken: string };

    const inspect = () =>
      page.evaluate(async () => ({
        local: JSON.stringify({ ...localStorage }),
        session: JSON.stringify({ ...sessionStorage }),
        cookie: document.cookie,
        history: JSON.stringify(history.state),
        databases: (await indexedDB.databases()).length,
        url: location.href,
        html: document.documentElement.outerHTML,
      }));

    for (const reload of [false, true]) {
      if (reload) {
        await page.reload();
        await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
      }
      const state = await inspect();
      expect(state.local).toBe('{}');
      expect(state.session).toBe('{}');
      expect(state.databases).toBe(0);
      expect(state.cookie).not.toContain('omr_refresh');
      const exposed = `${JSON.stringify(state)} ${logs.join(' ')}`;
      expect(exposed).not.toContain(TEST_PASSWORD);
      expect(exposed).not.toContain(accessToken);
    }
    const cookie = (await context.cookies()).find((c) => c.name === 'omr_refresh');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' });
  });

  test('el login se completa solo con teclado', async ({ page }) => {
    const correo = await createActiveAccount('teclado');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/iniciar-sesion');
    await expect(page.getByLabel('Correo')).toBeVisible();

    // Sin barra de trámites, el primer Tab llega al primer campo; los enlaces secundarios van después del botón.
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Correo')).toBeFocused();
    await page.keyboard.type(correo);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeFocused();
    await page.keyboard.type(TEST_PASSWORD);
    await page.keyboard.press('Enter');

    // Mientras llega el módulo diferido solo existe el título de la pantalla de espera.
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Tu sesión se cerró.');
  });
});

test.describe('Destino y retorno (CA-15, RN-16)', () => {
  test('sin ruta previa llega a /inicio', async ({ page }) => {
    await loginThroughUi(page, await createActiveAccount('destino'));
    expect(new URL(page.url()).pathname).toBe('/inicio');
  });

  test('la ruta privada solicitada se recupera tras entrar', async ({ page }) => {
    const correo = await createActiveAccount('retorno');

    await page.goto('/inicio');
    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    await submitLogin(page, correo);

    await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
  });

  for (const value of ['https://otro.example', '//otro.example', '/no-existe', 'javascript:alert(1)']) {
    test(`un parámetro redirect con ${value} se ignora`, async ({ page }) => {
      const correo = await createActiveAccount('redirect');

      await page.goto(`/iniciar-sesion?redirect=${encodeURIComponent(value)}&next=${encodeURIComponent(value)}`);
      await submitLogin(page, correo);

      await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
    });
  }

  test('una ruta inexistente termina en /inicio al entrar', async ({ page }) => {
    const correo = await createActiveAccount('inexistente');

    await page.goto('/no-existe');
    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    await submitLogin(page, correo);

    await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
  });

  test('con sesión, /iniciar-sesion lleva a /inicio', async ({ page }) => {
    await loginThroughUi(page, await createActiveAccount('con-sesion'));

    await page.goto('/iniciar-sesion');

    await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
  });
});

test.describe('Cuentas sin acceso (CA-05, CA-09, RN-05, RN-09)', () => {
  test('una cuenta pendiente de aprobación, con el flujo real, no entra a /inicio', async ({ page, context }) => {
    const correo = await registerAccount('pendiente');
    await page.goto(await readLink(correo, '/verificar-correo'));
    await page.getByRole('button', { name: 'Confirmar mi correo' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu correo quedó verificado.');
    await expect(page.getByText(/un administrador debe aprobar tu cuenta/)).toBeVisible();

    await page.goto('/iniciar-sesion');
    const responded = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
    await submitLogin(page, correo);

    expect((await responded).status()).toBe(401);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Correo o contraseña incorrectos');
    await expect(alert).toContainText(GUIDANCE);
    await expect(alert).toBeFocused();
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Correo')).toHaveValue(correo);
    expect((await context.cookies()).filter((c) => c.name === 'omr_refresh')).toEqual([]);

    await page.goto('/inicio');
    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  });

  test('el rechazo es idéntico para cualquier cuenta sin acceso, exista o no', async ({ page }) => {
    const pendiente = await registerAccount('sin-verificar');
    const bloqueada = await createActiveAccount('bloqueada');
    updateAccount(bloqueada, { estado: 'BLOQUEADA' });
    const desactivada = await createActiveAccount('desactivada');
    updateAccount(desactivada, { estado: 'DESACTIVADA' });
    const activa = await createActiveAccount('clave-mala');
    const messages: string[] = [];

    for (const [correo, password] of [
      [pendiente, TEST_PASSWORD],
      [bloqueada, TEST_PASSWORD],
      [desactivada, TEST_PASSWORD],
      [activa, 'contrasena-equivocada'],
      [uniqueEmail('no-existe'), TEST_PASSWORD],
    ] as const) {
      await page.goto('/iniciar-sesion');
      await submitLogin(page, correo, password);
      messages.push(await page.getByRole('alert').innerText());
    }

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toContain(GUIDANCE);
  });

  test('una cuenta ACTIVA sin rol (403 real de /me) ve el aviso, sin entrar ni generar un bucle', async ({ page }) => {
    const correo = await createActiveAccount('sin-rol');
    updateAccount(correo, { rol: null });
    const requests = countRequests(page);
    await page.goto('/iniciar-sesion');
    const denied = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/me`));

    await submitLogin(page, correo);

    expect((await denied).status()).toBe(403);
    await expect(page.getByRole('alert')).toContainText('Tu cuenta no está habilitada');
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    expect(requests.count('GET', '/me')).toBe(1);
    expect(requests.count('POST', '/logout')).toBe(0);

    // Riesgo de backend documentado (plan §15): la sesión no se revoca, así que al recargar se repite el 403, sin bucle.
    await page.goto('/inicio');
    await expect(page.getByRole('alert')).toContainText('Tu cuenta no está habilitada');
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    expect(requests.count('GET', '/me')).toBe(2);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  });

  test('una cuenta bloqueada con la sesión abierta pierde el acceso al recargar', async ({ page }) => {
    const correo = await createActiveAccount('bloqueo-en-sesion');
    await loginThroughUi(page, correo);

    updateAccount(correo, { estado: 'BLOQUEADA' });
    await page.reload();

    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toHaveCount(0);
  });
});

test.describe('Renovación y respuestas 401, 403 y 503, sin bucles (CA-08, plan §2.4)', () => {
  test('un 401 puntual de /me renueva una vez, reintenta y conserva la sesión', async ({ page }) => {
    await loginThroughUi(page, await createActiveAccount('renueva'));
    let intercepted = 0;
    await page.route(`**${AUTH}/me`, (route) => {
      intercepted += 1;
      return intercepted === 1 ? problemResponse(route, 401, 'no-autenticado') : route.continue();
    });
    const requests = countRequests(page);

    await page.reload();

    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
    expect(requests.count('POST', '/refresh')).toBe(2);
    expect(requests.count('GET', '/me')).toBe(2);
  });

  test('401 persistente de /me: sesión perdida, con aviso y un número finito de solicitudes', async ({ page }) => {
    await loginThroughUi(page, await createActiveAccount('perdida'));
    await page.route(`**${AUTH}/me`, (route) => problemResponse(route, 401, 'no-autenticado'));
    const requests = countRequests(page);

    await page.reload();

    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    await expect(page.getByRole('alert')).toContainText('Tu sesión terminó');
    await page.waitForTimeout(500);
    expect(requests.count('POST', '/refresh')).toBe(2);
    expect(requests.count('GET', '/me')).toBe(2);
  });

  test('la cookie reutilizada (rotación real) revoca la sesión y no entra en bucle', async ({ page, context }) => {
    await loginThroughUi(page, await createActiveAccount('reutilizada'));
    const stale = (await context.cookies()).filter((c) => c.name === 'omr_refresh');

    await page.reload();
    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
    await context.addCookies(stale);
    const requests = countRequests(page);
    await page.reload();

    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
    await page.waitForTimeout(500);
    expect(requests.count('POST', '/refresh')).toBe(1);
  });

  test('503 al restaurar no expulsa a la persona: reintentar recupera la sesión', async ({ page }) => {
    await loginThroughUi(page, await createActiveAccount('caida'));
    await page.route(`**${AUTH}/refresh`, (route) => problemResponse(route, 503, 'servicio-saturado'));

    await page.reload();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Servicio no disponible');
    await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
    await page.unroute(`**${AUTH}/refresh`);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
  });

  test('cierre con JWT vencido: renueva y luego cierra de verdad', async ({ page, context }) => {
    await loginThroughUi(page, await createActiveAccount('jwt-vencido'));
    let intercepted = 0;
    await page.route(`**${AUTH}/logout`, (route) => {
      intercepted += 1;
      return intercepted === 1 ? problemResponse(route, 401, 'no-autenticado') : route.continue();
    });

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(page.getByRole('status')).toHaveText('Tu sesión se cerró.');
    expect((await context.cookies()).filter((c) => c.name === 'omr_refresh')).toEqual([]);
  });

  test('sin red, el cierre no afirma haber terminado y se puede reintentar', async ({ page }) => {
    await loginThroughUi(page, await createActiveAccount('sin-red'));
    await page.route(`**${AUTH}/logout`, (route) => route.abort());

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();

    await expect(page.getByRole('alert')).toContainText('tu sesión sigue abierta');
    await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
    await page.unroute(`**${AUTH}/logout`);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('status')).toHaveText('Tu sesión se cerró.');
  });
});

test.describe('Desafío con el backend real (CA-11, RN-07, RN-10; script sustituido, DEC-06)', () => {
  test('el script solo se pide tras el desafío; la respuesta válida entra', async ({ page }) => {
    await stubTurnstile(page);
    const correo = await createActiveAccount('desafio');
    const turnstile: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('challenges.cloudflare.com')) turnstile.push(r.url());
    });
    await page.goto('/iniciar-sesion');

    await failLogins(page, correo, 5);
    expect(turnstile).toEqual([]);

    const challenged = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
    await submitLogin(page, correo);
    const response = await challenged;
    expect(response.status()).toBe(401);
    expect(((await response.json()) as { type: string }).type).toBe('urn:omr-preicfes:problema:desafio-requerido');

    await expect(page.getByRole('status')).toContainText('Completa la verificación de seguridad');
    expect(turnstile).toEqual(['https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit']);
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(TEST_PASSWORD);
    await expect(page.getByRole('group', { name: 'Verificación de seguridad' })).toBeVisible();
    const options = await page.evaluate(() => (window as unknown as { __turnstile: { options: unknown[] } }).__turnstile.options);
    expect(options).toEqual([{ sitekey: 'sitekey-solo-pruebas', action: 'login' }]);

    const sent = page.waitForRequest((r) => r.url().endsWith(`${AUTH}/login`));
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    expect((await sent).postDataJSON()).toEqual({ correo, password: TEST_PASSWORD, captchaToken: CAPTCHA_OK });
    await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
  });

  test('una respuesta rechazada por el backend pide resolver de nuevo y reinicia el widget', async ({ page }) => {
    await stubTurnstile(page, 'respuesta-rechazada');
    const correo = await createActiveAccount('rechazo');
    await page.goto('/iniciar-sesion');
    await failLogins(page, correo, 5);
    await submitLogin(page, correo);
    await expect(page.getByRole('status')).toContainText('Completa la verificación');

    const responded = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    expect((await responded).status()).toBe(401);
    await expect(page.getByRole('status')).toContainText('No pudimos validar la verificación');
    const resets = await page.evaluate(() => (window as unknown as { __turnstile: { resets: number } }).__turnstile.resets);
    expect(resets).toBe(1);
    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
  });

  test('con el script bloqueado no hay vía alternativa', async ({ page }) => {
    await page.route(TURNSTILE, (route) => route.abort());
    const correo = await createActiveAccount('bloqueo');
    const requests = countRequests(page);
    await page.goto('/iniciar-sesion');
    await failLogins(page, correo, 5);
    await submitLogin(page, correo);
    await expect(page.getByText('No podemos completar la verificación de seguridad')).toBeVisible();
    const attempts = requests.count('POST', '/login');

    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('No podemos completar la verificación de seguridad')).toBeVisible();
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForTimeout(300);

    expect(requests.count('POST', '/login')).toBe(attempts);
    await expect(page).toHaveURL(`${APP_ORIGIN}/iniciar-sesion`);
  });

  test('un script que no responde agota el plazo, avisa sin vía alternativa y permite reintentar', async ({ page }) => {
    test.setTimeout(60_000);
    // Retiene la solicitud sin responder, como un script que tarda demasiado.
    await page.route(TURNSTILE, () => undefined);
    const correo = await createActiveAccount('script-colgado');
    const requests = countRequests(page);
    await page.goto('/iniciar-sesion');
    await failLogins(page, correo, 5);
    await submitLogin(page, correo);
    await expect(page.getByRole('group', { name: 'Verificación de seguridad' })).toBeAttached();
    const attempts = requests.count('POST', '/login');
    await expect(page.getByText('No podemos completar la verificación de seguridad')).toHaveCount(0);

    await expect(page.getByText('No podemos completar la verificación de seguridad')).toBeVisible({ timeout: 20_000 });
    expect(requests.count('POST', '/login')).toBe(attempts);

    await page.unroute(TURNSTILE);
    await stubTurnstile(page);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('No podemos completar la verificación de seguridad')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => 'turnstile' in window)).toBe(true);
    expect(requests.count('POST', '/login')).toBe(attempts);

    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(`${APP_ORIGIN}/inicio`);
  });

  test('Turnstile no se carga en las rutas con token', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (new URL(r.url()).origin !== APP_ORIGIN) external.push(r.url());
    });

    for (const path of ['/verificar-correo', '/restablecer-contrasena', '/activar-cuenta']) {
      await page.goto(`${path}#token=enlace-de-prueba`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }

    expect(external).toEqual([]);
  });
});

test.describe('Accesibilidad y adaptación (CA-12, RNF-01)', () => {
  const WIDTHS = [375, 640, 1280] as const;

  test('un nombre largo y sin espacios no desborda /inicio a 375 px', async ({ page }) => {
    const correo = uniqueEmail('nombre-largo');
    const nombre = 'N'.repeat(120);
    const api = await request.newContext({ baseURL: APP_ORIGIN, extraHTTPHeaders: { Origin: APP_ORIGIN } });
    expect((await api.post(`${AUTH}/register`, { data: { nombre, correo, password: TEST_PASSWORD } })).status()).toBe(202);
    await api.dispose();
    updateAccount(correo, { estado: 'ACTIVA', rol: 'ADMIN' });
    await page.setViewportSize({ width: 375, height: 900 });

    await page.goto('/iniciar-sesion');
    await submitLogin(page, correo);
    await expect(page.getByText(`Hola, ${nombre}.`)).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('los controles miden al menos 44 px de alto en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });

    for (const path of ['/iniciar-sesion', '/registro', '/olvide-contrasena']) {
      await page.goto(path);
      await expect(page.getByLabel('Correo')).toBeVisible();
      const short = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('a, button, input')]
          .filter((element) => element.getBoundingClientRect().height < 44)
          .map((element) => `${element.tagName} ${element.textContent}`),
      );
      expect(short).toEqual([]);
    }
  });

  const STATES: Readonly<Record<string, (page: Page) => Promise<void>>> = {
    'login vacío': async (page) => {
      await page.goto('/iniciar-sesion');
      await expect(page.getByLabel('Correo')).toBeVisible();
    },
    'login con errores de campo': async (page) => {
      await page.goto('/iniciar-sesion');
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await expect(page.getByText('Escribe tu correo.')).toBeVisible();
    },
    'login rechazado': async (page) => {
      await page.goto('/iniciar-sesion');
      await submitLogin(page, uniqueEmail('axe'));
      await expect(page.getByRole('alert')).toBeVisible();
    },
    'login con desafío': async (page) => {
      await stubTurnstile(page);
      await page.goto('/iniciar-sesion');
      const correo = uniqueEmail('axe');
      await failLogins(page, correo, 5);
      await submitLogin(page, correo);
      await expect(page.getByRole('group', { name: 'Verificación de seguridad' })).toBeVisible();
    },
    'desafío no disponible': async (page) => {
      await page.route(TURNSTILE, (route) => route.abort());
      await page.goto('/iniciar-sesion');
      const correo = uniqueEmail('axe');
      await failLogins(page, correo, 5);
      await submitLogin(page, correo);
      await expect(page.getByText('No podemos completar la verificación de seguridad')).toBeVisible();
    },
    inicio: async (page) => {
      await loginThroughUi(page, await createActiveAccount('axe'));
    },
    'sesión cerrada': async (page) => {
      await loginThroughUi(page, await createActiveAccount('axe'));
      await page.getByRole('button', { name: 'Cerrar sesión' }).click();
      await expect(page.getByRole('status')).toHaveText('Tu sesión se cerró.');
    },
    'servicio no disponible': async (page) => {
      await page.route(`**${AUTH}/refresh`, (route) => problemResponse(route, 503, 'servicio-saturado'));
      await page.goto('/inicio');
      await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
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
