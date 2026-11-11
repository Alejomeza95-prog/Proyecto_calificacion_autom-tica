import { useState, type FormEvent } from 'react';
import type { TokenPasswordRequest } from '../api/types.ts';
import { discardLinkToken, getLinkToken } from '../link-token/capture.ts';
import { PASSWORD_POLICY_ERROR } from '../messages.ts';
import { validateNewPassword } from '../validation.ts';
import { fieldErrorsFromProblem } from './field-errors.ts';
import { useApiAction } from './use-api-action.ts';
import { useFirstInvalidFocus, useResultFocus } from './use-result-focus.ts';

const FIELD_MESSAGES = { password: PASSWORD_POLICY_ERROR };

export type LinkPasswordOutcome = 'hecho' | 'no-valido';

/**
 * Estado de un formulario que define una contraseña con el token de un enlace. Cada pantalla pone su solicitud y sus
 * textos (DEC-11). El `POST` solo sale al confirmar (RN-06). El token se conserva si el intento puede repetirse: solo
 * se olvida cuando se usó o el backend lo rechazó.
 */
export function useLinkPasswordForm(route: string, submit: (request: TokenPasswordRequest) => Promise<void>) {
  const [token] = useState(() => getLinkToken(route));
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string> | null>(null);
  const [outcome, setOutcome] = useState<LinkPasswordOutcome | null>(null);
  const { pending, blocked, error, run } = useApiAction();

  const banner = error && !fieldErrorsFromProblem(error, FIELD_MESSAGES) ? error : null;
  const bannerRef = useResultFocus<HTMLDivElement>(banner);
  const outcomeRef = useResultFocus<HTMLDivElement>(outcome);
  const formRef = useFirstInvalidFocus(fieldErrors);

  function finish(result: LinkPasswordOutcome) {
    discardLinkToken();
    setPassword('');
    setOutcome(result);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setFieldErrors({ password: passwordError });
      return;
    }
    setFieldErrors(null);

    const result = await run(() => submit({ token, password }));
    if (result.ok) {
      finish('hecho');
    } else if (result.error) {
      const fields = fieldErrorsFromProblem(result.error, FIELD_MESSAGES);
      if (fields) setFieldErrors(fields);
      // Un token mal formado es, para la persona, un enlace que no sirve.
      else if (result.error.kind === 'enlace-invalido' || result.error.kind === 'solicitud-invalida') finish('no-valido');
    }
  }

  return { token, password, setPassword, fieldErrors, outcome, pending, blocked, banner, bannerRef, outcomeRef, formRef, handleSubmit };
}
