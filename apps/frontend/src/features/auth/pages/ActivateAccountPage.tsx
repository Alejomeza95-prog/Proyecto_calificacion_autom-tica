import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { activateAccount } from '../api/auth-api.ts';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { PasswordField } from '../components/PasswordField.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { useLinkPasswordForm } from '../forms/use-link-password-form.ts';
import { problemMessage } from '../messages.ts';
import { PASSWORD_POLICY } from '../validation.ts';
import styles from './pages.module.css';

const TITLE = SCREEN_TITLES.activarCuenta;

/**
 * Flujo propio (RN-15, DEC-11): sin la barra de trámites, que ofrece la recuperación, y sin enlaces a ella. El enlace
 * nuevo solo lo emite la operación del servidor, así que no hay reenvío de autoservicio.
 */
export function ActivateAccountPage() {
  const { token, password, setPassword, fieldErrors, outcome, pending, blocked, banner, bannerRef, outcomeRef, formRef, handleSubmit } =
    useLinkPasswordForm(ROUTES.activarCuenta, activateAccount);

  if (outcome === 'hecho') {
    return (
      <AuthPage flow="activacion" title={TITLE}>
        <StatusMessage ref={outcomeRef} tone="success">
          Tu cuenta quedó activada.
        </StatusMessage>
        <p className={styles.note}>Ahora puedes iniciar sesión con la contraseña que definiste.</p>
        <ActionLink to={ROUTES.iniciarSesion} primary>
          Ir a Iniciar sesión
        </ActionLink>
      </AuthPage>
    );
  }

  if (outcome === 'no-valido') {
    return (
      <AuthPage flow="activacion" title={TITLE}>
        <StatusMessage ref={outcomeRef} tone="error">
          Este enlace de activación ya no sirve: venció, ya se usó o lo reemplazó uno más reciente. Pide uno nuevo a quien opera el
          sistema.
        </StatusMessage>
      </AuthPage>
    );
  }

  if (!token) {
    return (
      <AuthPage flow="activacion" title={TITLE}>
        <StatusMessage tone="info">
          No encontramos un enlace en esta página. Ábrelo de nuevo desde tu correo o pide uno nuevo a quien opera el sistema.
        </StatusMessage>
      </AuthPage>
    );
  }

  return (
    <AuthPage flow="activacion" title={TITLE} description="Define la contraseña con la que vas a entrar.">
      <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {banner && (
          <StatusMessage ref={bannerRef} tone="error">
            {problemMessage(banner)}
          </StatusMessage>
        )}
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="new-password"
          required
          hint={PASSWORD_POLICY}
          value={password}
          onChange={setPassword}
          error={fieldErrors?.password}
        />
        <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Activando…'}>
          Activar mi cuenta
        </SubmitButton>
      </form>
    </AuthPage>
  );
}
