import * as authApi from '../api/auth-api.ts';
import type { AccessTokenSource } from '../api/http-client.ts';
import { isApiError, isRecord } from '../api/problem.ts';
import type { AccessTokenResponse, LoginRequest, MeResponse } from '../api/types.ts';

const REFRESH_LOCK = 'omr-auth-refresh';
const SESSION_CHANNEL = 'omr-auth';

/** Por qué terminó una sesión que existía; `null` si simplemente no hay sesión. `cierre-de-sesion` es voluntario, aquí o en otra pestaña. */
export type SessionEndReason = 'sesion-perdida' | 'cuenta-no-habilitada' | 'cierre-de-sesion';

export type SessionSnapshot =
  | { readonly estado: 'comprobando' }
  | { readonly estado: 'anonima'; readonly motivo: SessionEndReason | null }
  | { readonly estado: 'autenticada'; readonly usuario: MeResponse }
  | { readonly estado: 'no-disponible' };

/** Interfaz pública: expone el estado de la sesión y nunca el token de acceso (RN-02). */
export interface SessionController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SessionSnapshot;
  /** Restaura la sesión una sola vez por carga, aunque se llame varias veces (`StrictMode`). */
  ensureRestored(): void;
  /** Repite la comprobación desde `no-disponible`. */
  retry(): void;
  /** Rechaza con `ApiError` sin cambiar el estado si la API no concede la sesión. */
  login(credentials: LoginRequest): Promise<void>;
  /** Rechaza con `ApiError` si no se puede confirmar el cierre: la sesión sigue activa (plan §2.4). */
  logout(): Promise<void>;
  dispose(): void;
}

/** Serializa la renovación entre pestañas; sin Web Locks, renueva sin coordinar (riesgo aceptado, plan §2.4). */
function withRefreshLock(renew: () => Promise<AccessTokenResponse>): Promise<AccessTokenResponse> {
  if (!('locks' in navigator) || !navigator.locks) return renew();
  return navigator.locks.request(REFRESH_LOCK, renew);
}

function isLogoutNotice(data: unknown): boolean {
  return isRecord(data) && data.tipo === 'logout';
}

/**
 * Sesión fuera de React (DEC-03). El token vive solo en este cierre: no pasa por el árbol de React, por
 * almacenes del navegador ni por `BroadcastChannel`. Sin temporizadores (DEC-04).
 */
export function createSessionController(): SessionController {
  let accessToken: string | null = null;
  let snapshot: SessionSnapshot = { estado: 'comprobando' };
  let restoreStarted = false;
  let renewal: Promise<string> | null = null;
  let channel: BroadcastChannel | null = null;
  /** Aumenta al iniciar o cerrar sesión: los resultados de operaciones anteriores se descartan. */
  let epoch = 0;
  const listeners = new Set<() => void>();

  function publish(next: SessionSnapshot): void {
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function endSession(motivo: SessionEndReason | null): void {
    epoch += 1;
    restoreStarted = true;
    accessToken = null;
    publish({ estado: 'anonima', motivo });
  }

  /** Una sola renovación en vuelo por pestaña; la promesa vive fuera de React. */
  function renew(): Promise<string> {
    if (renewal) return renewal;
    const startedAt = epoch;
    renewal = withRefreshLock(authApi.refresh)
      .then((granted) => {
        if (startedAt === epoch) accessToken = granted.accessToken;
        return granted.accessToken;
      })
      .finally(() => {
        renewal = null;
      });
    return renewal;
  }

  const tokens: AccessTokenSource = { current: () => accessToken, renew };

  function handleLoadFailure(error: unknown): void {
    if (isApiError(error, 'no-autenticado')) {
      // Sin token, es un visitante sin cookie; con token, la sesión existía y se perdió.
      endSession(accessToken === null ? null : 'sesion-perdida');
    } else if (isApiError(error, 'acceso-denegado')) {
      // Sin reintentos (plan §9.1). El backend tampoco admite `/logout` con este 403: solo se limpia aquí.
      endSession('cuenta-no-habilitada');
    } else {
      // Se conserva un token ya obtenido: reintentar no debe gastar otra rotación.
      publish({ estado: 'no-disponible' });
    }
  }

  async function loadUser(): Promise<void> {
    const startedAt = epoch;
    try {
      if (accessToken === null) await renew();
      const usuario = await authApi.getMe(tokens);
      if (startedAt === epoch) publish({ estado: 'autenticada', usuario });
    } catch (error) {
      if (startedAt === epoch) handleLoadFailure(error);
    }
  }

  function openChannel(): void {
    if (channel || typeof BroadcastChannel !== 'function') return;
    channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isLogoutNotice(event.data)) endSession('cierre-de-sesion');
    };
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot: () => snapshot,

    ensureRestored() {
      openChannel();
      if (restoreStarted) return;
      restoreStarted = true;
      void loadUser();
    },

    retry() {
      if (snapshot.estado !== 'no-disponible') return;
      publish({ estado: 'comprobando' });
      void loadUser();
    },

    async login(credentials) {
      const granted = await authApi.login(credentials);
      openChannel();
      epoch += 1;
      restoreStarted = true;
      accessToken = granted.accessToken;
      await loadUser();
    },

    async logout() {
      openChannel();
      try {
        await authApi.logout(tokens);
      } catch (error) {
        if (isApiError(error, 'no-autenticado')) return endSession('cierre-de-sesion');
        if (isApiError(error, 'acceso-denegado')) return endSession('cuenta-no-habilitada');
        throw error;
      }
      endSession('cierre-de-sesion');
      channel?.postMessage({ tipo: 'logout' });
    },

    dispose() {
      channel?.close();
      channel = null;
      listeners.clear();
    },
  };
}

export const sessionController = createSessionController();
