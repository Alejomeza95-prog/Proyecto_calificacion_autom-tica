import { useId, type ReactNode, type Ref } from 'react';
import styles from './fields.module.css';

export interface TextFieldProps {
  readonly label: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'email' | 'password';
  readonly autoComplete?: string;
  readonly hint?: string;
  /** Se muestra junto al campo y se asocia a él para lectores de pantalla. */
  readonly error?: string;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly ref?: Ref<HTMLInputElement>;
  /** Control adicional en la misma línea del campo. */
  readonly endSlot?: ReactNode;
}

export function TextField({
  label,
  name,
  value,
  onChange,
  type = 'text',
  autoComplete,
  hint,
  error,
  required = false,
  maxLength,
  ref,
  endSlot,
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      )}
      <div className={styles.control}>
        <input
          ref={ref}
          id={id}
          className={styles.input}
          name={name}
          type={type}
          value={value}
          autoComplete={autoComplete}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        {endSlot}
      </div>
      {error && (
        <p className={styles.error} id={errorId}>
          <svg className={styles.errorIcon} viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5 15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M8 6v4M8 11.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
