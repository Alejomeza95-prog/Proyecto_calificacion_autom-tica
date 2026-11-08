import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const FIXTURE = '/e2e/fixtures/base-components.html';
const FLOWS = ['acceso', 'registro', 'recuperacion', 'activacion'] as const;
// 640 px en 1280 equivale a un zoom del 200 % (RNF-01).
const WIDTHS = [375, 640, 1280] as const;

test.describe('Componentes base y dirección visual (RNF-01, CA-12)', () => {
  for (const flow of FLOWS) {
    for (const width of WIDTHS) {
      test(`${flow} a ${width} px: sin violaciones de axe ni desbordes`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${FIXTURE}?flow=${flow}`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${v.id}: ${v.impact}`)).toEqual([]);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        await page.screenshot({ path: testInfo.outputPath(`${flow}-${width}.png`), fullPage: true });
      });
    }
  }

  test('el teclado recorre los controles con foco visible, en orden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(FIXTURE);
    // La plantilla no tiene barra de trámites: el primer control es el primer campo.
    const order = [
      page.getByLabel('Correo'),
      page.getByLabel('Contraseña', { exact: true }),
      page.getByRole('button', { name: 'Mostrar contraseña' }),
      page.getByRole('button', { name: 'Iniciar sesión' }),
    ];

    for (const control of order) {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      const outline = await control.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).toBe('solid');
    }
  });

  test('mostrar la contraseña conserva el valor y el foco', async ({ page }) => {
    await page.goto(FIXTURE);
    const input = page.getByLabel('Contraseña', { exact: true });
    await input.fill('una-clave-larga');
    const toggle = page.getByRole('button', { name: 'Mostrar contraseña' });

    await toggle.focus();
    await page.keyboard.press('Enter');

    await expect(input).toHaveValue('una-clave-larga');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toBeFocused();
  });

  test('sin solicitudes a otros orígenes (RN-07)', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== 'http://localhost:5174') external.push(request.url());
    });

    await page.goto(FIXTURE);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(external).toEqual([]);
  });
});
