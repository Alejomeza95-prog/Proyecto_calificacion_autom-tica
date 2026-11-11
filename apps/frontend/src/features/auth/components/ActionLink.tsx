import type { ReactNode } from 'react';
import { Link } from 'react-router';
import styles from './fields.module.css';

interface ActionLinkProps {
  readonly to: string;
  /** La acción principal de la pantalla, cuando consiste en ir a otra pantalla. */
  readonly primary?: boolean;
  /** Carga la aplicación de nuevo, para que el estado de la sesión se vuelva a comprobar. */
  readonly reloadDocument?: boolean;
  readonly children: ReactNode;
}

export function ActionLink({ to, primary = false, reloadDocument = false, children }: ActionLinkProps) {
  return (
    <Link to={to} reloadDocument={reloadDocument} className={primary ? styles.primaryLink : styles.secondaryLink}>
      {children}
    </Link>
  );
}
