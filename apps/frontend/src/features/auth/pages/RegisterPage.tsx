import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES, SCREEN_TITLES } from '../../../app/routes.ts';
import { register } from '../api/auth-api.ts';
import { ActionLink } from '../components/ActionLink.tsx';
import { AuthPage } from '../components/AuthPage.tsx';
import { PasswordField } from '../components/PasswordField.tsx';
import { StatusMessage } from '../components/StatusMessage.tsx';
import { SubmitButton } from '../components/SubmitButton.tsx';
import { TextField } from '../components/TextField.tsx';
import { fieldErrorsFromProblem } from '../forms/field-errors.ts';
import { useApiAction } from '../forms/use-api-action.ts';
import { useFirstInvalidFocus, useResultFocus } from '../forms/use-result-focus.ts';
import { PASSWORD_POLICY_ERROR, problemMessage } from '../messages.ts';
import { rememberPendingVerification } from '../registration/pending-verification.ts';
import { PASSWORD_POLICY, validateCorreo, validateNewPassword, validateNombre } from '../validation.ts';
import styles from './pages.module.css';

const FIELD_MESSAGES = {
  nombre: 'Revisa tu nombre.',
  correo: 'Revisa el correo. Debe tener la forma nombre@dominio.com.',
  password: PASSWORD_POLICY_ERROR,
};

/** Solo nombre, correo y contraseña: el formulario público no ofrece rol ni institución (RN-04). */
export function RegisterPage() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);
  const { pending, blocked, error, run } = useApiAction();

  const banner = error && !fieldErrorsFromProblem(error, FIELD_MESSAGES) ? error : null;
  const bannerRef = useResultFocus<HTMLDivElement>(banner);
  const formRef = useFirstInvalidFocus(fieldErrors);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const nombreError = validateNombre(nombre);
    const correoError = validateCorreo(correo);
    const passwordError = validateNewPassword(password);
    const local = {
      ...(nombreError ? { nombre: nombreError } : {}),
      ...(correoError ? { correo: correoError } : {}),
      ...(passwordError ? { password: passwordError } : {}),
    };
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      return;
    }
    setFieldErrors(null);

    const result = await run(() => register({ nombre, correo, password }));
    if (result.ok) {
      rememberPendingVerification({ correo: correo.trim(), mensaje: result.value.mensaje });
      void navigate(ROUTES.revisaTuCorreo);
    } else if (result.error) {
      setFieldErrors(fieldErrorsFromProblem(result.error, FIELD_MESSAGES));
    }
  }

  return (
    <AuthPage
      flow="registro"
      title={SCREEN_TITLES.registro}
      description="Te enviaremos un enlace para confirmar tu correo. Después, un administrador habilitará tu cuenta."
    >
      <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} noValidate>
        {banner && (
          <StatusMessage ref={bannerRef} tone="error">
            {problemMessage(banner)}
          </StatusMessage>
        )}
        <TextField
          label="Nombre"
          name="nombre"
          autoComplete="name"
          required
          value={nombre}
          onChange={setNombre}
          error={fieldErrors?.nombre}
        />
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
          autoComplete="new-password"
          required
          hint={PASSWORD_POLICY}
          value={password}
          onChange={setPassword}
          error={fieldErrors?.password}
        />
        <SubmitButton pending={pending || blocked} pendingLabel={blocked ? 'Espera para reintentar' : 'Creando tu cuenta…'}>
          Crear cuenta
        </SubmitButton>
      </form>
      <div className={styles.footer}>
        <p className={styles.switch}>
          ¿Ya tienes cuenta? <ActionLink to={ROUTES.iniciarSesion}>Iniciar sesión</ActionLink>
        </p>
      </div>
    </AuthPage>
  );
}
