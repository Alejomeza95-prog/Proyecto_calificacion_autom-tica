import { Link } from 'react-router';
import { APP_ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { AppShell } from '../../navigation/AppShell.tsx';
import page from '../../navigation/page.module.css';
import { hasRole, ROLES_LECTURA_CLAVES, ROLES_USUARIOS } from '../../navigation/permissions.ts';
import { ROLE_LABELS } from '../../navigation/role-labels.ts';
import { useSession } from '../session/session-context.ts';

/**
 * Vista de inicio: solo datos de `GET /api/v1/auth/me`. La protege `RequireAuth`. Desde HT-AUTH-03 se muestra
 * dentro de `AppShell`, cuyo menú lateral incluye el cierre de sesión.
 */
export function HomePage() {
  const { session } = useSession();
  if (session.estado !== 'autenticada') return null;
  const { nombre, rol } = session.usuario;

  return (
    <AppShell title={SCREEN_TITLES.inicio} description={`Hola, ${nombre}.`}>
      <section className={page.panel} aria-label="Tu cuenta">
        {rol && <p>Tu rol: {ROLE_LABELS[rol]}</p>}
        <ul className={page.stack} style={{ marginTop: 'var(--step-2)', paddingLeft: '1.25rem' }}>
          {hasRole(rol, ROLES_LECTURA_CLAVES) && (
            <li>
              <Link className={page.link} to={APP_ROUTES.claves}>
                Registrar o consultar claves de respuesta
              </Link>
            </li>
          )}
          {hasRole(rol, ROLES_USUARIOS) && (
            <li>
              <Link className={page.link} to={APP_ROUTES.usuarios}>
                Aprobar cuentas pendientes
              </Link>
            </li>
          )}
        </ul>
      </section>
    </AppShell>
  );
}
