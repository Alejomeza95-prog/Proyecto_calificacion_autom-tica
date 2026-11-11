import type { FormEvent } from 'react';
import { SCREEN_TITLES } from '../../../app/routes.ts';
import type { Role } from '../api/types.ts';
import { AuthPage } from '../components/AuthPage.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { useApiAction } from '../forms/use-api-action.ts';
import { useResultFocus } from '../forms/use-result-focus.ts';
import { useSession } from '../session/session-context.ts';
import styles from './pages.module.css';

const ROLE_LABELS: Readonly<Record<Role, string>> = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  DOCENTE: 'Docente',
};

/** Vista básica: solo datos de `GET /api/v1/auth/me`. La protege `RequireAuth`. */
export function HomePage() {
  const { session, logout } = useSession();
  const { pending, blocked, error, run } = useApiAction();
  const errorRef = useResultFocus<HTMLDivElement>(error);

  if (session.estado !== 'autenticada') return null;
  const { nombre, rol } = session.usuario;

  function handleLogout(event: FormEvent) {
    event.preventDefault();
    void run(logout);
  }

  return (
    <AuthPage flow="acceso" title={SCREEN_TITLES.inicio} description={`Hola, ${nombre}.`}>
      {rol && <p className={styles.note}>Tu rol: {ROLE_LABELS[rol]}</p>}
      <form onSubmit={handleLogout} noValidate>
        {error && (
          <StatusMessage ref={errorRef} tone="error">
            {/* Sin confirmación del backend no se afirma que se cerró (plan §2.4). */}
            No pudimos confirmar el cierre: tu sesión sigue abierta. Inténtalo de nuevo.
          </StatusMessage>
        )}
        <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Cerrando sesión…'}>
          Cerrar sesión
        </SubmitButton>
      </form>
    </AuthPage>
  );
}
