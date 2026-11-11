import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { resetPassword } from '../api/auth-api.ts';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { PasswordField } from '../components/PasswordField.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { useLinkPasswordForm } from '../forms/use-link-password-form.ts';
import { problemMessage } from '../messages.ts';
import { PASSWORD_POLICY } from '../validation.ts';
import styles from './pages.module.css';

const TITLE = SCREEN_TITLES.restablecerContrasena;

function RequestNewLink() {
  return (
    <ActionLink to={ROUTES.olvideContrasena} primary>
      Pedir otro enlace
    </ActionLink>
  );
}

export function ResetPasswordPage() {
  const { token, password, setPassword, fieldErrors, outcome, pending, blocked, banner, bannerRef, outcomeRef, formRef, handleSubmit } =
    useLinkPasswordForm(ROUTES.restablecerContrasena, resetPassword);

  if (outcome === 'hecho') {
    return (
      <AuthPage flow="recuperacion" title={TITLE}>
        <StatusMessage ref={outcomeRef} tone="success">
          Tu contraseña se cambió.
        </StatusMessage>
        <p className={styles.note}>Inicia sesión con tu nueva contraseña. Por seguridad, cerramos las sesiones que tenías abiertas.</p>
        {/* Recarga la aplicación: la sesión de este navegador, si la había, ya fue revocada por el backend. */}
        <ActionLink to={ROUTES.iniciarSesion} primary reloadDocument>
          Ir a Iniciar sesión
        </ActionLink>
      </AuthPage>
    );
  }

  if (outcome === 'no-valido') {
    return (
      <AuthPage flow="recuperacion" title={TITLE}>
        <StatusMessage ref={outcomeRef} tone="error">
          Este enlace ya no sirve: venció, ya se usó o lo reemplazó uno más reciente. Pide otro para continuar.
        </StatusMessage>
        <RequestNewLink />
      </AuthPage>
    );
  }

  if (!token) {
    return (
      <AuthPage flow="recuperacion" title={TITLE}>
        <StatusMessage tone="info">No encontramos un enlace en esta página. Ábrelo de nuevo desde tu correo o pide otro.</StatusMessage>
        <RequestNewLink />
      </AuthPage>
    );
  }

  return (
    <AuthPage flow="recuperacion" title={TITLE} description="Escribe la contraseña que usarás de ahora en adelante.">
      <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {banner && (
          <StatusMessage ref={bannerRef} tone="error">
            {problemMessage(banner)}
          </StatusMessage>
        )}
        <PasswordField
          label="Nueva contraseña"
          name="password"
          autoComplete="new-password"
          required
          hint={PASSWORD_POLICY}
          value={password}
          onChange={setPassword}
          error={fieldErrors?.password}
        />
        <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Guardando…'}>
          Guardar contraseña
        </SubmitButton>
      </form>
    </AuthPage>
  );
}
