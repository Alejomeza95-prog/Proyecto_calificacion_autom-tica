import { isLinkTokenRoute } from '../../../app/routes.ts';

/** El token de un enlace solo se entrega a la pantalla de su ruta (plan §2.5). */
let captured: { readonly route: string; readonly token: string } | null = null;

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '');
}

/**
 * Se ejecuta antes de renderizar: guarda `#token=` en memoria y lo retira de la barra de direcciones, también
 * del historial (RN-06). Nada se envía aquí: el token solo se consume cuando la persona confirma.
 */
export function captureLinkToken(): void {
  const { pathname, search, hash } = window.location;
  if (!isLinkTokenRoute(pathname) || hash === '') return;

  const token = new URLSearchParams(hash.slice(1)).get('token');
  if (token) captured = { route: normalizePath(pathname), token };
  window.history.replaceState(window.history.state, '', `${pathname}${search}`);
}

/**
 * Un enlace abierto en una pestaña que ya está en esa ruta solo cambia el fragmento, sin cargar la página. Se recarga
 * para que pase por la captura normal; si no, el token quedaría en la barra de direcciones (RN-06).
 */
export function reloadOnLinkOpenedInPlace(): void {
  window.addEventListener('hashchange', () => {
    const { pathname, hash } = window.location;
    if (isLinkTokenRoute(pathname) && hash !== '') window.location.reload();
  });
}

export function getLinkToken(route: string): string | null {
  return captured?.route === route ? captured.token : null;
}

/** Olvida el token cuando ya no puede servir: usado o rechazado. */
export function discardLinkToken(): void {
  captured = null;
}
