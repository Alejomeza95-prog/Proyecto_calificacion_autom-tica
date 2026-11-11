import { useState } from 'react';
import { TextField, type TextFieldProps } from './TextField.tsx';
import styles from './fields.module.css';

type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'endSlot' | 'autoComplete'> & {
  /** Permite el autocompletado de gestores de contraseñas. */
  readonly autoComplete: 'current-password' | 'new-password';
};

/** Admite pegar y gestores de contraseñas; mostrarla no borra lo escrito ni mueve el foco. */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      endSlot={
        <button
          type="button"
          className={styles.toggle}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      }
    />
  );
}
