import { useState, type FormEvent } from 'react';
import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { resendVerification } from '../api/auth-api.ts';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { TextField } from '../components/TextField.tsx';
import { fieldErrorsFromProblem } from '../forms/field-errors.ts';
import { useApiAction } from '../forms/use-api-action.ts';
import { useFirstInvalidFocus, useResultFocus } from '../forms/use-result-focus.ts';
import { problemMessage } from '../messages.ts';
import { getPendingVerification } from '../registration/pending-verification.ts';
import { validateCorreo } from '../validation.ts';
import styles from './pages.module.css';

const FIELD_MESSAGES = { correo: 'Revisa el correo. Debe tener la forma nombre@dominio.com.' };

export function ResendVerificationPage() {
  const [correo, setCorreo] = useState(() => getPendingVerification()?.correo ?? '');
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

    const result = await run(() => resendVerification(correo));
    if (result.ok) setSent(result.value);
    else if (result.error) setFieldErrors(fieldErrorsFromProblem(result.error, FIELD_MESSAGES));
  }

  return (
    <AuthPage
      flow="registro"
      title={SCREEN_TITLES.reenviarVerificacion}
      description="Escribe tu correo y, si tiene una verificación pendiente, te enviaremos un enlace nuevo. El anterior dejará de servir."
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
      <div className={styles.footer}>
        <ActionLink to={ROUTES.iniciarSesion}>Volver a Iniciar sesión</ActionLink>
      </div>
    </AuthPage>
  );
}
