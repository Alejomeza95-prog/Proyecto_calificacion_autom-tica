import { expect, request, test } from '@playwright/test';
import { API_DIRECT, APP_ORIGIN, uniqueEmail } from './support/env.ts';

const FORGOT = '/api/v1/auth/password/forgot';

interface BrowserResponse {
  readonly status: number;
  readonly retryAfter: string | null;
}

/** `POST` desde JavaScript en la página, igual que lo hará la aplicación. */
async function postFromPage(page: import('@playwright/test').Page, correo: string): Promise<BrowserResponse> {
  return page.evaluate(
    async ([path, value]) => {
      const response = await fetch(path as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: value }),
      });
      return { status: response.status, retryAfter: response.headers.get('retry-after') };
    },
    [FORGOT, correo],
  );
}

test.describe('Proxy de mismo origen (plan §8)', () => {
  test('V-1: un POST de la aplicación por el proxy llega con el Origin permitido', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    const sent = page.waitForRequest((r) => r.url().endsWith(FORGOT));

    const result = await postFromPage(page, uniqueEmail('v1'));

    // `headers()` omite las cabeceras de seguridad; `allHeaders()` devuelve las realmente enviadas.
    expect((await (await sent).allHeaders())['origin']).toBe(APP_ORIGIN);
    expect(result.status).toBe(202);
  });

  test('V-1: el proxy no reemplaza ni añade Origin', async () => {
    const proxy = await request.newContext({ baseURL: APP_ORIGIN });
    const data = { correo: uniqueEmail('v1b') };

    const foreign = await proxy.post(FORGOT, { data, headers: { Origin: 'https://ajeno.example' } });
    const missing = await proxy.post(FORGOT, { data });

    expect(foreign.status()).toBe(403);
    expect(await foreign.json()).toMatchObject({ type: 'urn:omr-preicfes:problema:origen-no-permitido' });
    expect(missing.status()).toBe(403);
    await proxy.dispose();
  });

  test('V-2: la API directa rechaza un Origin ajeno', async () => {
    const direct = await request.newContext();

    const response = await direct.post(`${API_DIRECT}/refresh`, { headers: { Origin: 'https://ajeno.example' } });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ type: 'urn:omr-preicfes:problema:origen-no-permitido' });
    await direct.dispose();
  });

  test('V-3: JavaScript lee Retry-After de un 429 real', async ({ page }) => {
    await page.goto('/olvide-contrasena');
    const correo = uniqueEmail('v3');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await postFromPage(page, correo)).status).toBe(202);
    }
    const limited = await postFromPage(page, correo);

    expect(limited.status).toBe(429);
    expect(Number(limited.retryAfter)).toBeGreaterThan(0);
  });
});
