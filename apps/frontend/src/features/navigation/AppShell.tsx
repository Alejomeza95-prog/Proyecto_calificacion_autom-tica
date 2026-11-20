import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigationType } from 'react-router';
import { StatusMessage } from '../auth/components/StatusMessage.tsx';
import { SubmitButton } from '../auth/components/SubmitButton.tsx';
import { useApiAction } from '../auth/forms/use-api-action.ts';
import { useResultFocus } from '../auth/forms/use-result-focus.ts';
import { useSession } from '../auth/session/session-context.ts';
import styles from './AppShell.module.css';
import { navItemsFor } from './nav-items.ts';
import { ROLE_LABELS } from './role-labels.ts';

interface AppShellProps {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}

/** Cierre de sesión dentro del menú; sin confirmación del backend no afirma que se cerró (HT-AUTH-02 plan §2.4). */
function LogoutControl() {
  const { logout } = useSession();
  const { pending, blocked, error, run } = useApiAction();
  const errorRef = useResultFocus<HTMLDivElement>(error);

  function handleLogout(event: FormEvent) {
    event.preventDefault();
    void run(logout);
  }

  return (
    <form className={styles.logout} onSubmit={handleLogout} noValidate>
      {error && (
        <StatusMessage ref={errorRef} tone="error">
          No pudimos confirmar el cierre: tu sesión sigue abierta. Inténtalo de nuevo.
        </StatusMessage>
      )}
      <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Cerrando sesión…'}>
        Cerrar sesión
      </SubmitButton>
    </form>
  );
}

/**
 * Estructura de las pantallas privadas (HT-AUTH-03 CA-04, CA-05, DEC-09): menú lateral con las opciones del
 * rol, opción actual con `aria-current="page"` y cierre de sesión. En pantallas angostas el menú se abre y se
 * cierra con un botón (también con Escape) y se cierra al navegar. La protege `RequireAuth`.
 */
export function AppShell({ title, description, children }: AppShellProps) {
  const { session } = useSession();
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const heading = useRef<HTMLHeadingElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  // El menú queda abierto solo en la ruta donde se abrió: navegar lo cierra sin un efecto adicional.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const menuId = useId();

  useEffect(() => {
    document.title = `${title} · OMR-PreICFES`;
  }, [title]);

  // Al cambiar de pantalla dentro de la aplicación, el foco va al título (RNF-01); al abrirla no se mueve.
  useEffect(() => {
    if (navigationType !== 'POP') heading.current?.focus();
  }, [navigationType, pathname]);

  if (session.estado !== 'autenticada') return null;
  const { nombre, rol } = session.usuario;
  const items = navItemsFor(rol);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && open) {
      setOpenAt(null);
      toggle.current?.focus();
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <p className={styles.brand}>OMR-PreICFES</p>
        <button
          ref={toggle}
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpenAt(open ? null : pathname)}
        >
          {open ? 'Cerrar menú' : 'Menú'}
        </button>
      </header>

      <aside id={menuId} className={styles.sidebar} data-open={open} onKeyDown={handleKeyDown}>
        <p className={`${styles.brand} ${styles.sidebarBrand}`}>OMR-PreICFES</p>
        <div className={styles.user}>
          <p className={styles.userName}>{nombre}</p>
          {rol && <p className={styles.userRole}>{ROLE_LABELS[rol]}</p>}
        </div>
        <nav aria-label="Navegación principal">
          <ul className={styles.navList}>
            {items.map((item) => (
              <li key={item.key}>
                <NavLink to={item.path} end={item.key === 'inicio'} className={styles.navLink}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <LogoutControl />
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          {description && <p className={styles.description}>{description}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
