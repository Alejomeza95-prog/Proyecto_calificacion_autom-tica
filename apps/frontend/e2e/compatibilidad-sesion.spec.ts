import { expect, test, type Page } from '@playwright/test';
import { SEED_ADMIN } from './support/env.ts';

const AUTH = '/api/v1/auth';

async function postJson(page: Page, path: string, body?: unknown, bearer?: string) {
  return page.evaluate(
    async ({ path: url, body: payload, bearer: token }) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
      const text = await response.text();
      return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
    },
    { path, body, bearer },
  );
}

async function login(page: Page) {
  const result = await postJson(page, `${AUTH}/login`, { correo: SEED_ADMIN.correo, password: SEED_ADMIN.password });
  expect(result.status).toBe(200);
  return String(result.body?.accessToken);
}

// V-4 (plan §8) y V-5, que se repite en Firefox y WebKit (DEC-12).
test.describe('Sesión por el proxy en localhost', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/iniciar-sesion');
  });

  test('V-4: la cookie conserva sus atributos, y JavaScript no la lee', async ({ page, context, browserName }) => {
    const responded = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/login`));
    const token = await login(page);
    const setCookie = (await (await responded).allHeaders())['set-cookie'] ?? '';

    expect(setCookie).toMatch(/omr_refresh=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Path=\/api\/v1\/auth/i);

    const cookie = (await context.cookies()).find((c) => c.name === 'omr_refresh');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, path: '/api/v1/auth' });
    // WebKit en Windows informa `None` a Playwright aunque recibió `SameSite=Strict`, comprobado arriba en la cabecera.
    // Sin verificar cómo lo aplica ese motor (plan §15).
    if (browserName !== 'webkit') expect(cookie?.sameSite).toBe('Strict');

    expect(await page.evaluate(() => document.cookie)).not.toContain('omr_refresh');
    expect(token.length).toBeGreaterThan(0);
  });

  // Límite local previsto en DEC-12. Si WebKit empieza a enviar la cookie, esta prueba falla y avisa de que V-5 ya aplica.
  // El ciclo completo de sesión en WebKit se comprueba sobre HTTPS, en `compatibilidad-flujos.spec.ts`.
  test('V-5 en WebKit: guarda la cookie Secure pero no la envía sobre http://localhost', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'Solo describe el límite de WebKit');
    await login(page);

    expect((await postJson(page, `${AUTH}/refresh`)).status).toBe(401);
  });

  test('V-5: inicio de sesión, recarga, renovación y cierre', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit no envía la cookie Secure sobre http://localhost (DEC-12)');
    await login(page);

    // `SessionProvider` restaura la sesión al cargar. Una renovación propia antes de que termine reutilizaría
    // la cookie anterior y revocaría la sesión (rotación sin período de gracia), así que se espera su `/me`.
    const refreshCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith(`${AUTH}/refresh`)) refreshCalls.push(r.method());
    });
    const restored = page.waitForResponse((r) => r.url().endsWith(`${AUTH}/me`));
    await page.reload();
    expect((await restored).status()).toBe(200);
    // En desarrollo, `StrictMode` monta dos veces: la renovación sigue siendo una sola (CA-08).
    expect(refreshCalls).toHaveLength(1);

    const renewed = await postJson(page, `${AUTH}/refresh`);
    expect(renewed.status).toBe(200);
    const token = String(renewed.body?.accessToken);

    const me = await page.evaluate(
      async ({ url, bearer }) => {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
        return { status: response.status, body: (await response.json()) as Record<string, unknown> };
      },
      { url: `${AUTH}/me`, bearer: token },
    );
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ estado: 'ACTIVA', rol: 'ADMIN', institucionId: null });
    expect(Object.keys(me.body).sort()).toEqual(['estado', 'id', 'institucionId', 'nombre', 'rol']);

    expect((await postJson(page, `${AUTH}/logout`, undefined, token)).status).toBe(204);
    expect((await postJson(page, `${AUTH}/refresh`)).status).toBe(401);
  });
});
