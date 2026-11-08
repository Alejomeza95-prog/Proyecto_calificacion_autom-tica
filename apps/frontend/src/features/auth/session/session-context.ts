import { createContext, useContext } from 'react';
import type { LoginRequest } from '../api/types.ts';
import type { SessionSnapshot } from './session-controller.ts';

/** Solo el estado de autenticación y los datos de `/me`; el token no entra en el árbol de React (RN-02). */
export interface SessionContextValue {
  readonly session: SessionSnapshot;
  login(credentials: LoginRequest): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession debe usarse dentro de SessionProvider');
  return value;
}
