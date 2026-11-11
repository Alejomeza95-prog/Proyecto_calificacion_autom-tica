import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROUTES } from '../../../app/routes.ts';
import { captureLinkToken, discardLinkToken, getLinkToken } from './capture.ts';

afterEach(() => {
  discardLinkToken();
  window.history.pushState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('Captura del token del enlace (RN-06)', () => {
  it.each([ROUTES.verificarCorreo, ROUTES.restablecerContrasena, ROUTES.activarCuenta])(
    'en %s guarda el token y limpia la URL',
    (route) => {
      window.history.pushState({}, '', `${route}#token=abc123`);

      captureLinkToken();

      expect(getLinkToken(route)).toBe('abc123');
      expect(window.location.hash).toBe('');
      expect(window.location.href).not.toContain('abc123');
      expect(window.location.pathname).toBe(route);
    },
  );

  it('decodifica el token como lo codificó el backend', () => {
    window.history.pushState({}, '', `${ROUTES.verificarCorreo}#token=${encodeURIComponent('a+b/c=')}`);

    captureLinkToken();

    expect(getLinkToken(ROUTES.verificarCorreo)).toBe('a+b/c=');
  });

  it('el token solo se entrega a la pantalla de su ruta', () => {
    window.history.pushState({}, '', `${ROUTES.verificarCorreo}#token=abc123`);

    captureLinkToken();

    expect(getLinkToken(ROUTES.restablecerContrasena)).toBeNull();
    expect(getLinkToken(ROUTES.activarCuenta)).toBeNull();
  });

  it('un fragmento sin token también se limpia, y no se captura nada', () => {
    window.history.pushState({}, '', `${ROUTES.verificarCorreo}#otra=cosa`);

    captureLinkToken();

    expect(getLinkToken(ROUTES.verificarCorreo)).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('fuera de las rutas con token no captura ni toca la URL', () => {
    window.history.pushState({}, '', `${ROUTES.registro}#token=abc123`);

    captureLinkToken();

    expect(getLinkToken(ROUTES.registro)).toBeNull();
    expect(window.location.hash).toBe('#token=abc123');
  });

  it('reemplaza la entrada del historial, sin agregar una', () => {
    window.history.pushState({ marca: 1 }, '', `${ROUTES.verificarCorreo}#token=abc123`);
    const entries = window.history.length;

    captureLinkToken();

    expect(window.history.length).toBe(entries);
    expect(window.history.state).toEqual({ marca: 1 });
  });

  it('no hace solicitudes ni usa almacenes', () => {
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    window.history.pushState({}, '', `${ROUTES.verificarCorreo}#token=abc123`);

    captureLinkToken();

    expect(fetchStub).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('tras descartarlo, ya no hay token', () => {
    window.history.pushState({}, '', `${ROUTES.verificarCorreo}#token=abc123`);
    captureLinkToken();

    discardLinkToken();

    expect(getLinkToken(ROUTES.verificarCorreo)).toBeNull();
  });
});
