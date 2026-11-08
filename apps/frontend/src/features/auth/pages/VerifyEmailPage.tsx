import { useState, type FormEvent } from 'react';
import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { verifyEmail } from '../api/auth-api.ts';
import type { AccountStatus } from '../api/types.ts';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { useApiAction } from '../forms/use-api-action.ts';
import { useResultFocus } from '../forms/use-result-focus.ts';
import { discardLinkToken, getLinkToken } from '../link-token/capture.ts';
import { problemMessage } from '../messages.ts';
import styles from './pages.module.css';

type Outcome =
  | { readonly tipo: 'verificado'; readonly estado: AccountStatus }
  | { readonly tipo: 'no-valido' };

function ResendAction() {
  return (
    <ActionLink to={ROUTES.reenviarVerificacion} primary>
      Reenviar verificación
    </ActionLink>
  );
}

/**
 * Abrir el enlace no consume nada: la solicitud solo sale al confirmar, nunca desde un efecto, de modo que ni
 * `StrictMode` ni un escáner de correo gastan el token (RN-06).
 */
export function VerifyEmailPage() {
  const [token] = useState(() => getLinkToken(ROUTES.verificarCorreo));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const { pending, blocked, error, run } = useApiAction();

  const outcomeRef = useResultFocus<HTMLDivElement>(outcome);
  const errorRef = useResultFocus<HTMLDivElement>(error);

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    const result = await run(() => verifyEmail(token));
    if (result.ok) {
      discardLinkToken();
      setOutcome({ tipo: 'verificado', estado: result.value.estado });
    } else if (result.error?.kind === 'enlace-invalido' || result.error?.kind === 'solicitud-invalida') {
      // Un token mal formado es, para la persona, un enlace que no sirve.
      discardLinkToken();
      setOutcome({ tipo: 'no-valido' });
    }
  }

  if (outcome?.tipo === 'verificado') {
    return (
      <AuthPage flow="registro" title={SCREEN_TITLES.verificarCorreo}>
        <StatusMessage ref={outcomeRef} tone="success">
          Tu correo quedó verificado.
        </StatusMessage>
        {outcome.estado === 'PENDIENTE_APROBACION' ? (
          <p className={styles.note}>
            Falta un paso: un administrador debe aprobar tu cuenta. Hasta entonces no podrás iniciar sesión. No tienes que
            hacer nada más por ahora.
          </p>
        ) : (
          <>
            <p className={styles.note}>Ahora puedes intentar iniciar sesión con tu correo y tu contraseña.</p>
            <ActionLink to={ROUTES.iniciarSesion} primary>
              Ir a Iniciar sesión
            </ActionLink>
          </>
        )}
      </AuthPage>
    );
  }

  if (outcome?.tipo === 'no-valido') {
    return (
      <AuthPage flow="registro" title={SCREEN_TITLES.verificarCorreo}>
        <StatusMessage ref={outcomeRef} tone="error">
          Este enlace ya no sirve: venció, ya se usó o lo reemplazó uno más reciente. Pide otro para continuar.
        </StatusMessage>
        <ResendAction />
      </AuthPage>
    );
  }

  if (!token) {
    return (
      <AuthPage flow="registro" title={SCREEN_TITLES.verificarCorreo}>
        <StatusMessage tone="info">
          No encontramos un enlace en esta página. Ábrelo de nuevo desde tu correo o pide otro.
        </StatusMessage>
        <ResendAction />
      </AuthPage>
    );
  }

  return (
    <AuthPage flow="registro" title={SCREEN_TITLES.verificarCorreo} description="Confirma que este correo es tuyo para continuar.">
      <form onSubmit={(event) => void handleConfirm(event)} noValidate>
        {error && (
          <StatusMessage ref={errorRef} tone="error">
            {problemMessage(error)}
          </StatusMessage>
        )}
        <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Confirmando…'}>
          Confirmar mi correo
        </SubmitButton>
      </form>
    </AuthPage>
  );
}
