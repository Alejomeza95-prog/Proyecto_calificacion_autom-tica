import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createActiveAccount, registerAccount, TEST_NAME, TEST_PASSWORD, updateAccount } from './support/test-accounts.ts';

/**
 * HT-AUTH-03 contra el backend real y aislado (DEC-13), con las migraciones 003 y 004 aplicadas por el contenedor:
 * T-27 flujo crítico (CA-02, CA-06, CA-09, CA-10) y T-28 accesibilidad y menú en pantallas angostas (CA-05, RNF-01).
 */
const INSTITUCION_A = 'Institución Semilla A';

async function login(page: Page, correo: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  // Argon2id con concurrencia limitada (HT-AUTH-01 DEC-17) puede tardar más de 5 s en una máquina cargada.
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 20_000 });
  await expect(page.getByText(`Hola, ${TEST_NAME}.`)).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Navegación principal' });

test('T-27: el ADMIN aprueba una cuenta y el COORDINADOR crea, edita y publica una clave', async ({ page }) => {
  const admin = await createActiveAccount('ht03-admin');
  const pendiente = await registerAccount('ht03-coord');
  updateAccount(pendiente, { estado: 'PENDIENTE_APROBACION' });

  // CA-01, CA-02: el ADMIN aprueba desde el panel de usuarios.
  await login(page, admin);
  await nav(page).getByRole('link', { name: 'Usuarios' }).click();
  await expect(page).toHaveURL(/\/usuarios$/);
  await expect(nav(page).getByRole('link', { name: 'Usuarios' })).toHaveAttribute('aria-current', 'page');
  const row = page.getByRole('row').filter({ hasText: pendiente });
  await row.getByRole('button', { name: /^Aprobar a / }).click();
  const form = page.getByRole('form', { name: /^Aprobar a / });
  await form.getByLabel('Rol').selectOption('COORDINADOR');
  await form.getByLabel('Institución').selectOption({ label: INSTITUCION_A });
  await form.getByRole('button', { name: 'Confirmar aprobación' }).click();
  await expect(page.getByText(/ya puede iniciar sesión/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: pendiente })).toHaveCount(0);
  await expectNoSeriousViolations(page);
  await logout(page);

  // CA-04: el COORDINADOR aprobado entra y no ve «Usuarios».
  await login(page, pendiente);
  await expect(page.getByText('Tu rol: Coordinador')).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
  await page.goto('/usuarios');
  await expect(page).toHaveURL(/\/inicio$/);

  // CA-06: nueva clave con prueba agregada al catálogo y grilla dinámica.
  await nav(page).getByRole('link', { name: 'Claves de respuesta' }).click();
  await page.getByRole('link', { name: 'Nueva clave' }).click();
  const prueba = `Simulacro E2E ${Date.now()}`;
  await page.getByLabel('¿No está la prueba? Agrégala').fill(prueba);
  await page.getByRole('button', { name: 'Agregar prueba' }).click();
  await expect(page.getByLabel('Nombre de la prueba')).toHaveValue(/[0-9a-f]{24}/);
  await page.getByLabel('Fecha').fill('2026-11-11');
  await page.getByLabel('Sesión').selectOption('SESION_1');
  await page.getByLabel('Materia').selectOption('ING');
  await page.getByLabel('Cantidad de preguntas').fill('3');
  await expect(page.getByRole('group', { name: /^Pregunta / })).toHaveCount(3);
  await page.getByRole('group', { name: 'Pregunta 1' }).getByRole('radio', { name: 'A' }).check();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText(/Borrador guardado/)).toBeVisible();
  await expect(page).toHaveURL(/\/claves\/[0-9a-f]{24}$/);

  // CA-10: publicar incompleta se rechaza y resalta las faltantes.
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByRole('alert')).toContainText('Para publicar, responde las preguntas 2 y 3.');

  // CA-09 + CA-10: completa, guarda con la versión y publica.
  await page.getByRole('group', { name: /Pregunta 2/ }).getByRole('radio', { name: 'B' }).check();
  await page.getByRole('group', { name: /Pregunta 3/ }).getByRole('radio', { name: 'D' }).check();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Cambios guardados.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.getByText(/Clave publicada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar borrador' })).toHaveCount(0);

  // CA-11: aparece en el listado como Publicada.
  await page.getByRole('link', { name: '← Volver a las claves de respuesta' }).click();
  const clave = page.getByRole('row').filter({ hasText: prueba });
  await expect(clave).toContainText('Publicada');
  await expect(clave).toContainText('3 de 3');
  await expectNoSeriousViolations(page);
});

test.describe('T-28: pantallas angostas (CA-05)', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('el menú se abre con un botón, se recorre con teclado y no hay infracciones graves', async ({ page }) => {
    const admin = await createActiveAccount('ht03-movil');
    await login(page, admin);
    const toggle = page.getByRole('button', { name: 'Menú' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav(page)).toBeHidden();

    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute('aria-expanded', 'true');
    await expect(nav(page)).toBeVisible();
    await expectNoSeriousViolations(page);

    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Menú' })).toBeFocused();

    await page.getByRole('button', { name: 'Menú' }).click();
    await nav(page).getByRole('link', { name: 'Claves de respuesta' }).click();
    await expect(page).toHaveURL(/\/claves$/);
    await expect(page.getByRole('button', { name: 'Menú' })).toHaveAttribute('aria-expanded', 'false');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
