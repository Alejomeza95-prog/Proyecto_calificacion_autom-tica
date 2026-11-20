import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '../../app/routes.ts';
import { json, problem } from '../../test/fake-auth-api.ts';
import { disposeControllers, renderApp } from '../../test/render-app.tsx';

// La primera carga diferida de cada pantalla puede tardar más de 1 s en una máquina cargada.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  disposeControllers();
  vi.unstubAllGlobals();
});

const LIST = 'GET /api/v1/admin/usuarios?estado=PENDIENTE_APROBACION&pagina=1&limite=50';
const ID = '65f0000000000000000000aa';
const APPROVE = `POST /api/v1/admin/usuarios/${ID}/aprobar`;
const pendingPage = (items: object[]) => json(200, { items, total: items.length, pagina: 1, limite: 50 });
const ANA = { id: ID, nombre: 'Ana Prueba', correo: 'ana@example.test', registradoEn: '2026-11-10T15:00:00.000Z' };
const INSTITUCIONES = { 'GET /api/v1/instituciones': () => json(200, [{ id: '64a000000000000000000001', nombre: 'Institución A' }]) };

async function openApproval() {
  fireEvent.click(await screen.findByRole('button', { name: 'Aprobar a Ana Prueba' }));
  const form = await screen.findByRole('form', { name: 'Aprobar a Ana Prueba' });
  await waitFor(() => expect(within(form).getByLabelText('Institución')).toBeEnabled());
  return form;
}

// HT-AUTH-03 T-23 (CA-01, CA-02, CA-03).
describe('panel de usuarios', () => {
  it('CA-01: lista las cuentas pendientes con nombre, correo y fecha', async () => {
    renderApp(APP_ROUTES.usuarios, 'ADMIN', { [LIST]: () => pendingPage([ANA]) });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Ana Prueba')).toBeInTheDocument();
    expect(within(table).getByText('ana@example.test')).toBeInTheDocument();
  });

  it('CA-01: sin pendientes muestra un estado vacío', async () => {
    renderApp(APP_ROUTES.usuarios, 'ADMIN', { [LIST]: () => pendingPage([]) });
    expect(await screen.findByText('No hay cuentas pendientes de aprobación.')).toBeInTheDocument();
  });

  it('CA-02: aprueba con rol e institución, informa y recarga la lista', async () => {
    const fake = renderApp(APP_ROUTES.usuarios, 'ADMIN', {
      [LIST]: [() => pendingPage([ANA]), () => pendingPage([])],
      ...INSTITUCIONES,
      [APPROVE]: () => json(200, { id: ID, estado: 'ACTIVA', rol: 'DOCENTE', institucionId: '64a000000000000000000001' }),
    });
    const form = await openApproval();
    fireEvent.change(within(form).getByLabelText('Rol'), { target: { value: 'DOCENTE' } });
    fireEvent.change(within(form).getByLabelText('Institución'), { target: { value: '64a000000000000000000001' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmar aprobación' }));

    expect(await screen.findByText('Cuenta aprobada: Ana Prueba ya puede iniciar sesión.')).toBeInTheDocument();
    const call = fake.calls.find((c) => c.route === APPROVE);
    expect(JSON.parse(call?.rawBody ?? '{}')).toEqual({ rol: 'DOCENTE', institucionId: '64a000000000000000000001' });
    expect(call?.headers.authorization).toBe('Bearer token-de-prueba');
    expect(await screen.findByText('No hay cuentas pendientes de aprobación.')).toBeInTheDocument();
  });

  it('CA-03: exige rol e institución antes de enviar', async () => {
    const fake = renderApp(APP_ROUTES.usuarios, 'ADMIN', { [LIST]: () => pendingPage([ANA]), ...INSTITUCIONES });
    const form = await openApproval();
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmar aprobación' }));
    expect(await within(form).findByText('Selecciona el rol y la institución.')).toBeInTheDocument();
    expect(within(form).getByLabelText('Rol')).toHaveAttribute('aria-invalid', 'true');
    expect(fake.count(APPROVE)).toBe(0);
  });

  it('CA-03/RN-04: 409 informa que ya no está pendiente y recarga', async () => {
    const fake = renderApp(APP_ROUTES.usuarios, 'ADMIN', {
      [LIST]: [() => pendingPage([ANA]), () => pendingPage([])],
      ...INSTITUCIONES,
      [APPROVE]: () => problem(409, 'conflicto'),
    });
    const form = await openApproval();
    fireEvent.change(within(form).getByLabelText('Rol'), { target: { value: 'COORDINADOR' } });
    fireEvent.change(within(form).getByLabelText('Institución'), { target: { value: '64a000000000000000000001' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Confirmar aprobación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta ya no está pendiente');
    await waitFor(() => expect(fake.count(LIST)).toBe(2));
  });

  it('el selector de rol nunca ofrece Administrador (RN-03)', async () => {
    renderApp(APP_ROUTES.usuarios, 'ADMIN', { [LIST]: () => pendingPage([ANA]), ...INSTITUCIONES });
    const form = await openApproval();
    const options = within(within(form).getByLabelText('Rol')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Selecciona un rol', 'Coordinador', 'Docente']);
  });
});
