import { useState, type FormEvent } from 'react';
import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { resendVerification } from '../api/auth-api.ts';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { useApiAction } from '../forms/use-api-action.ts';
import { useResultFocus } from '../forms/use-result-focus.ts';
import { problemMessage } from '../messages.ts';
import { getPendingVerification, rememberPendingVerification } from '../registration/pending-verification.ts';
import styles from './pages.module.css';

export function CheckEmailPage() {
  const [pendingInfo, setPendingInfo] = useState(getPendingVerification);
  const { pending, blocked, error, run } = useApiAction();

  // El mensaje es el del backend, tal como llega, e igual para cualquier correo (RN-05).
  const messageRef = useResultFocus<HTMLDivElement>(pendingInfo);
  const errorRef = useResultFocus<HTMLDivElement>(error);

  async function handleResend(event: FormEvent) {
    event.preventDefault();
    if (!pendingInfo) return;
    const { correo } = pendingInfo;

    const result = await run(() => resendVerification(correo));
    if (result.ok) {
      const next = { correo, mensaje: result.value.mensaje };
      rememberPendingVerification(next);
      setPendingInfo(next);
    }
  }

  return (
    <AuthPage
      flow="registro"
      title={SCREEN_TITLES.revisaTuCorreo}
      description="Abre el enlace que te enviamos para continuar. Puede tardar unos minutos; revisa también el correo no deseado."
    >
      {pendingInfo ? (
        <form onSubmit={(event) => void handleResend(event)} noValidate>
          {error ? (
            <StatusMessage ref={errorRef} tone="error">
              {problemMessage(error)}
            </StatusMessage>
          ) : (
            <StatusMessage ref={messageRef} tone="info">
              {pendingInfo.mensaje}
            </StatusMessage>
          )}
          <p className={styles.note}>Correo que escribiste: {pendingInfo.correo}</p>
          <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Enviando…'}>
            Pedir otro enlace
          </SubmitButton>
        </form>
      ) : (
        <>
          <p className={styles.note}>Si no te llegó el enlace o ya venció, pide otro con tu correo.</p>
          <ActionLink to={ROUTES.reenviarVerificacion} primary>
            Reenviar verificación
          </ActionLink>
        </>
      )}
      <div className={styles.footer}>
        <ActionLink to={ROUTES.iniciarSesion}>Volver a Iniciar sesión</ActionLink>
      </div>
    </AuthPage>
  );
}
