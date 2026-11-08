import { useState, type FormEvent } from 'react';
import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { forgotPassword } from '../api/auth-api.ts';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { TextField } from '../components/TextField.tsx';
import { fieldErrorsFromProblem } from '../forms/field-errors.ts';
import { useApiAction } from '../forms/use-api-action.ts';
import { useFirstInvalidFocus, useResultFocus } from '../forms/use-result-focus.ts';
import { problemMessage } from '../messages.ts';
import { validateCorreo } from '../validation.ts';
import styles from './pages.module.css';

const FIELD_MESSAGES = { correo: 'Revisa el correo. Debe tener la forma nombre@dominio.com.' };

/** Siempre muestra el mensaje del backend, igual para cualquier correo (RN-05). */
export function ForgotPasswordPage() {
  const [correo, setCorreo] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);
  const [sent, setSent] = useState<{ readonly mensaje: string } | null>(null);
  const { pending, blocked, error, run } = useApiAction();

  const banner = error && !fieldErrorsFromProblem(error, FIELD_MESSAGES) ? error : null;
  const bannerRef = useResultFocus<HTMLDivElement>(banner);
  const sentRef = useResultFocus<HTMLDivElement>(sent);
  const formRef = useFirstInvalidFocus(fieldErrors);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const correoError = validateCorreo(correo);
    if (correoError) {
      setFieldErrors({ correo: correoError });
      setSent(null);
      return;
    }
    setFieldErrors(null);
    setSent(null);

    const result = await run(() => forgotPassword(correo));
    if (result.ok) setSent(result.value);
    else if (result.error) setFieldErrors(fieldErrorsFromProblem(result.error, FIELD_MESSAGES));
  }

  return (
    <AuthPage
      flow="recuperacion"
      title={SCREEN_TITLES.olvideContrasena}
      description="Escribe tu correo y te indicaremos cómo crear una contraseña nueva."
    >
      <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {banner && (
          <StatusMessage ref={bannerRef} tone="error">
            {problemMessage(banner)}
          </StatusMessage>
        )}
        {sent && (
          <StatusMessage ref={sentRef} tone="info">
            {sent.mensaje}
          </StatusMessage>
        )}
        <TextField
          label="Correo"
          name="correo"
          type="email"
          autoComplete="email"
          required
          value={correo}
          onChange={setCorreo}
          error={fieldErrors?.correo}
        />
        <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Enviando…'}>
          Enviar enlace
        </SubmitButton>
      </form>
      {/* El mensaje del backend remite a este reenvío; se ofrece siempre, para no distinguir cuentas. */}
      <div className={styles.footer}>
        <div className={styles.links}>
          {sent && <ActionLink to={ROUTES.reenviarVerificacion}>Reenviar verificación</ActionLink>}
          <ActionLink to={ROUTES.iniciarSesion}>Volver a Iniciar sesión</ActionLink>
        </div>
      </div>
    </AuthPage>
  );
}
