import { configure, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES, PRIVATE_ROUTES, ROUTES } from '../../app/routes.ts';
import { json } from '../../test/fake-auth-api.ts';
import { currentRoute, disposeControllers, renderApp } from '../../test/render-app.tsx';
import { navItemsFor } from './nav-items.ts';

// La primera carga diferida de cada pantalla puede tardar más de 1 s en una máquina cargada.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  disposeControllers();
  vi.unstubAllGlobals();
});

const emptyKeys = { 'GET /api/v1/claves-respuesta?limite=100': () => json(200, { items: [], total: 0 }), 'GET /api/v1/pruebas': () => json(200, []) };

// HT-AUTH-03 T-21/T-22 (CA-04, CA-05, RN-05).
describe('menú lateral por rol (CA-04, RN-05)', () => {
  it('navItemsFor: Usuarios solo para ADMIN; Claves para todos los roles', () => {
    expect(navItemsFor('ADMIN').map((i) => i.label)).toEqual(['Inicio', 'Claves de respuesta', 'Usuarios']);
    expect(navItemsFor('COORDINADOR').map((i) => i.label)).toEqual(['Inicio', 'Claves de respuesta']);
    expect(navItemsFor('DOCENTE').map((i) => i.label)).toEqual(['Inicio', 'Claves de respuesta']);
    expect(navItemsFor(null).map((i) => i.label)).toEqual(['Inicio']);
  });

  it('las rutas privadas nuevas admiten volver tras iniciar sesión', () => {
    expect(PRIVATE_ROUTES).toEqual([ROUTES.inicio, '/usuarios', '/claves', '/claves/nueva']);
    expect(Object.values(APP_ROUTES)).toEqual(['/usuarios', '/claves', '/claves/nueva', '/claves/:id']);
  });

  it('ADMIN ve Inicio, Claves y Usuarios; la opción actual lleva aria-current y hay cierre de sesión', async () => {
    renderApp(ROUTES.inicio, 'ADMIN');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Inicio', 'Claves de respuesta', 'Usuarios']);
    expect(within(nav).getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Usuarios' })).not.toHaveAttribute('aria-current');
    expect(await screen.findByText('Tu rol: Administrador')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('DOCENTE no ve Usuarios', async () => {
    renderApp(ROUTES.inicio, 'DOCENTE');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument();
  });

  it('DOCENTE que escribe /usuarios vuelve a /inicio sin ver el panel (CA-04)', async () => {
    const fake = renderApp(APP_ROUTES.usuarios, 'DOCENTE');
    await screen.findByRole('heading', { name: 'Inicio' });
    expect(currentRoute()).toBe(ROUTES.inicio);
    expect(fake.routes().some((r) => r.includes('/admin/usuarios'))).toBe(false);
  });

  it('DOCENTE que escribe /claves/nueva vuelve a /inicio (solo consulta, DEC-06)', async () => {
    renderApp(APP_ROUTES.claveNueva, 'DOCENTE');
    await screen.findByRole('heading', { name: 'Inicio' });
    expect(currentRoute()).toBe(ROUTES.inicio);
  });

  it('navegar desde el menú marca la nueva opción como actual', async () => {
    renderApp(ROUTES.inicio, 'COORDINADOR', emptyKeys);
    await screen.findByText('Tu rol: Coordinador');
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Claves de respuesta' }));
    await screen.findByText('No hay claves con estos filtros.');
    expect(currentRoute()).toBe(APP_ROUTES.claves);
    // El menú se vuelve a montar con la nueva pantalla: se consulta de nuevo.
    const current = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(within(current).getByRole('link', { name: 'Claves de respuesta' })).toHaveAttribute('aria-current', 'page');
    expect(within(current).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
  });
});

describe('menú en pantallas angostas (CA-05)', () => {
  it('el botón abre y cierra el menú con aria-expanded; Escape lo cierra y devuelve el foco', async () => {
    renderApp(ROUTES.inicio, 'ADMIN');
    await screen.findByText('Tu rol: Administrador');
    const toggle = screen.getByRole('button', { name: 'Menú' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const menu = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(menu).not.toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Cerrar menú');
    expect(menu).toHaveAttribute('data-open', 'true');

    fireEvent.keyDown(within(menu as HTMLElement).getByRole('link', { name: 'Inicio' }), { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('navegar cierra el menú abierto', async () => {
    renderApp(ROUTES.inicio, 'ADMIN', emptyKeys);
    await screen.findByText('Tu rol: Administrador');
    fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación principal' })).getByRole('link', { name: 'Claves de respuesta' }));
    await screen.findByText('No hay claves con estos filtros.');
    expect(screen.getByRole('button', { name: 'Menú' })).toHaveAttribute('aria-expanded', 'false');
  });
});
