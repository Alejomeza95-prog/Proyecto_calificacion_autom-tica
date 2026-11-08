import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { getCaptchaSiteKey } from '../captcha/site-key.ts';
import { TurnstileWidget, type TurnstileHandle } from '../captcha/TurnstileWidget.tsx';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { PasswordField } from '../components/PasswordField.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { TextField } from '../components/TextField.tsx';
import { fieldErrorsFromProblem } from '../forms/field-errors.ts';
import { useApiAction } from '../forms/use-api-action.ts';
import { useFirstInvalidFocus, useResultFocus } from '../forms/use-result-focus.ts';
import { CAPTCHA_UNAVAILABLE, LOGIN_GUIDANCE, problemMessage, SESSION_END_MESSAGES } from '../messages.ts';
import { getReturnPath, safeReturnPath } from '../session/safe-return.ts';
import { useSession } from '../session/session-context.ts';
import { validateLoginCorreo, validateLoginPassword } from '../validation.ts';
import type { ApiError } from '../api/problem.ts';
import styles from './pages.module.css';

const FIELD_MESSAGES = { correo: 'Revisa el correo.', password: 'Revisa la contraseña.' };
const CAPTCHA_PENDING = 'Completa la verificación de seguridad y vuelve a pulsar Iniciar sesión.';
const CAPTCHA_REJECTED = 'No pudimos validar la verificación de seguridad. Resuélvela de nuevo y vuelve a pulsar Iniciar sesión.';

/**
 * Inicio de sesión (plan §2.6). El primer envío va sin respuesta de desafío. Tras `desafio-requerido`, la persona
 * resuelve el widget y vuelve a enviar: no se reenvía solo, para no repetir intentos con una respuesta rechazada.
 */
export function LoginPage() {
  const { session, login } = useSession();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);
  const [loginDone, setLoginDone] = useState(false);

  const [challenge, setChallenge] = useState(false);
  const [captchaRejected, setCaptchaRejected] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const [captchaPrompt, setCaptchaPrompt] = useState<{ readonly text: string } | null>(null);
  const [widgetAttempt, setWidgetAttempt] = useState(0);
  const widget = useRef<TurnstileHandle>(null);

  const { pending, blocked, error, run } = useApiAction();

  const isFieldProblem = error !== null && fieldErrorsFromProblem(error, FIELD_MESSAGES) !== null;
  const sessionEnded =
    session.estado === 'anonima'
      ? session.motivo
      : session.estado === 'autenticada' && session.usuario.estado !== 'ACTIVA'
        ? 'cuenta-no-habilitada'
        : null;

  const bannerTrigger = captchaPrompt ?? (isFieldProblem ? null : error) ?? sessionEnded;
  const bannerRef = useResultFocus<HTMLDivElement>(bannerTrigger);
  const formRef = useFirstInvalidFocus(fieldErrors);

  if (session.estado === 'autenticada' && session.usuario.estado === 'ACTIVA') {
    return <Navigate to={safeReturnPath(getReturnPath())} replace />;
  }
  // La sesión se concedió, pero `/me` no respondió: la ruta privada ofrece el reintento (plan §2.4).
  if (loginDone && session.estado === 'no-disponible') {
    return <Navigate to={safeReturnPath(getReturnPath())} replace />;
  }

  function handleProblem(problem: ApiError, sentCaptcha: boolean) {
    switch (problem.kind) {
      case 'credenciales-invalidas':
        setPassword('');
        break;
      case 'desafio-requerido':
        setChallenge(true);
        setCaptchaRejected(sentCaptcha);
        break;
      default:
        setFieldErrors(fieldErrorsFromProblem(problem, FIELD_MESSAGES));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setCaptchaPrompt(null);

    const correoError = validateLoginCorreo(correo);
    const passwordError = validateLoginPassword(password);
    if (correoError || passwordError) {
      setFieldErrors({
        ...(correoError ? { correo: correoError } : {}),
        ...(passwordError ? { password: passwordError } : {}),
      });
      return;
    }
    setFieldErrors(null);

    if (challenge && captchaUnavailable) {
      // Vuelve a intentar cargar el widget; sin él no se envía nada (RN-10).
      setCaptchaUnavailable(false);
      setWidgetAttempt((attempt) => attempt + 1);
      return;
    }
    if (challenge && captchaToken === null) {
      setCaptchaPrompt({ text: CAPTCHA_PENDING });
      return;
    }

    const sentCaptcha = captchaToken;
    const result = await run(() => login({ correo, password, ...(sentCaptcha === null ? {} : { captchaToken: sentCaptcha }) }));
    if (!result.ok && result.error === null) return;

    if (sentCaptcha !== null) {
      widget.current?.reset();
      setCaptchaToken(null);
    }
    if (result.ok) setLoginDone(true);
    else if (result.error) handleProblem(result.error, sentCaptcha !== null);
  }

  function renderBanner(): ReactNode {
    if (captchaPrompt) {
      return (
        <StatusMessage ref={bannerRef} tone="error">
          {captchaPrompt.text}
        </StatusMessage>
      );
    }
    if (error && !isFieldProblem) {
      if (error.kind === 'credenciales-invalidas') {
        return (
          <StatusMessage ref={bannerRef} tone="error">
            {/* El título genérico del backend (RN-05). */}
            <p>{error.title ?? 'Correo o contraseña incorrectos'}</p>
            <p>{LOGIN_GUIDANCE}</p>
          </StatusMessage>
        );
      }
      if (error.kind === 'desafio-requerido') {
        return (
          <StatusMessage ref={bannerRef} tone="info">
            {captchaRejected ? CAPTCHA_REJECTED : CAPTCHA_PENDING}
          </StatusMessage>
        );
      }
      return (
        <StatusMessage ref={bannerRef} tone="error">
          {problemMessage(error)}
        </StatusMessage>
      );
    }
    if (sessionEnded) {
      return (
        <StatusMessage ref={bannerRef} tone={sessionEnded === 'cierre-de-sesion' ? 'info' : 'error'}>
          {SESSION_END_MESSAGES[sessionEnded]}
        </StatusMessage>
      );
    }
    return null;
  }

  return (
    <AuthPage flow="acceso" title={SCREEN_TITLES.iniciarSesion} description="Entra con tu correo y tu contraseña.">
      <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {renderBanner()}
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
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
          error={fieldErrors?.password}
        />
        {challenge && (
          <TurnstileWidget
            key={widgetAttempt}
            ref={widget}
            siteKey={getCaptchaSiteKey()}
            onToken={setCaptchaToken}
            onUnavailable={() => setCaptchaUnavailable(true)}
          />
        )}
        {challenge && captchaUnavailable && <StatusMessage tone="error">{CAPTCHA_UNAVAILABLE}</StatusMessage>}
        <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Entrando…'}>
          Iniciar sesión
        </SubmitButton>
      </form>
      <div className={styles.footer}>
        <p className={styles.note}>¿Olvidaste tu contraseña o no te llegó el enlace de verificación?</p>
        <div className={styles.links}>
          <ActionLink to={ROUTES.olvideContrasena}>Olvidé mi contraseña</ActionLink>
          <ActionLink to={ROUTES.reenviarVerificacion}>Reenviar verificación</ActionLink>
        </div>
        <p className={styles.switch}>
          ¿No tienes cuenta? <ActionLink to={ROUTES.registro}>Crear cuenta</ActionLink>
        </p>
      </div>
    </AuthPage>
  );
}
