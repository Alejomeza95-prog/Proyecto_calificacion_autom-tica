import { afterEach, describe, expect, it } from 'vitest';
import { ROUTES } from '../../../app/routes.ts';
import { forgetReturnPath, getReturnPath, rememberReturnPath, safeReturnPath } from './safe-return.ts';

afterEach(forgetReturnPath);

const ALLOWED = ['/inicio', '/resultados'];

describe('safeReturnPath (CA-15, RN-16)', () => {
  it('sin ruta solicitada lleva a /inicio', () => {
    expect(safeReturnPath(null)).toBe(ROUTES.inicio);
  });

  it('una ruta privada registrada se conserva', () => {
    expect(safeReturnPath('/inicio')).toBe('/inicio');
    expect(safeReturnPath('/resultados', ALLOWED)).toBe('/resultados');
  });

  it.each([
    ['otro sitio con //', '//otro.example'],
    ['esquema https', 'https://otro.example'],
    ['esquema javascript', 'javascript:alert(1)'],
    ['esquema data', 'data:text/html,x'],
    ['barra invertida inicial', '\\\\otro.example'],
    ['barra y barra invertida', '/\\otro.example'],
    ['barra invertida interna', '/inicio\\..\\otro'],
    ['tres barras', '///otro.example'],
    ['ruta inexistente', '/no-existe'],
    ['ruta pública', '/registro'],
    ['con parámetros', '/inicio?redirect=https://otro.example'],
    ['con fragmento', '/inicio#x'],
    ['subruta', '/inicio/otra'],
    ['relativa', 'inicio'],
    ['recorrido', '/../inicio'],
    ['codificada', '/%2F%2Fotro.example'],
    ['espacio inicial', ' /inicio'],
    ['vacía', ''],
  ])('rechaza %s', (_name, value) => {
    expect(safeReturnPath(value, ALLOWED)).toBe(ROUTES.inicio);
  });

  it('ninguna ruta admitida por defecto es pública', () => {
    expect(safeReturnPath(ROUTES.iniciarSesion)).toBe(ROUTES.inicio);
  });
});

describe('Ruta solicitada en memoria', () => {
  it('se recuerda y se olvida', () => {
    rememberReturnPath('/inicio');
    expect(getReturnPath()).toBe('/inicio');

    forgetReturnPath();
    expect(getReturnPath()).toBeNull();
  });
});
