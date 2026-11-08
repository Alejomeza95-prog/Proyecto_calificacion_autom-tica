import { useState, type FormEvent } from 'react';
import { AuthPage, type AuthFlow } from '../../src/features/auth/components/AuthPage.tsx';
import { PasswordField } from '../../src/features/auth/components/PasswordField.tsx';
import { StatusMessage } from '../../src/features/auth/components/StatusMessage.tsx';
import { SubmitButton } from '../../src/features/auth/components/SubmitButton.tsx';
import { TextField } from '../../src/features/auth/components/TextField.tsx';

interface BaseComponentsFixtureProps {
  readonly flow: AuthFlow;
  readonly pending: boolean;
}

/** Reúne todos los estados de los componentes base; contenido sintético, sin datos reales. */
export function BaseComponentsFixture({ flow, pending }: BaseComponentsFixtureProps) {
  const [correo, setCorreo] = useState('docente@example.test');
  const [password, setPassword] = useState('');

  return (
    <AuthPage flow={flow} title="Iniciar sesión" description="Al entrar irás a tu inicio.">
      <form onSubmit={(event: FormEvent) => event.preventDefault()} noValidate>
        <StatusMessage tone="error">El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.</StatusMessage>
        <TextField label="Correo" name="correo" type="email" autoComplete="email" value={correo} onChange={setCorreo} />
        <PasswordField
          label="Contraseña"
          name="password"
          autoComplete="current-password"
          hint="Entre 12 y 128 caracteres."
          error="Escribe tu contraseña."
          value={password}
          onChange={setPassword}
        />
        <SubmitButton pending={pending} pendingLabel="Enviando…">
          Iniciar sesión
        </SubmitButton>
        <StatusMessage tone="success">Listo: tu contraseña se actualizó.</StatusMessage>
        <StatusMessage tone="info">Revisa tu correo. El enlace vence pronto.</StatusMessage>
      </form>
    </AuthPage>
  );
}
