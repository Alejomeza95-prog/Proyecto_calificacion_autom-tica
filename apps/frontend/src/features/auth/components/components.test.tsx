import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage.tsx';
import { PasswordField } from './PasswordField.tsx';
import { StatusMessage } from './StatusMessage.tsx';
import { SubmitButton } from './SubmitButton.tsx';
import { TextField } from './TextField.tsx';

function ControlledPassword() {
  const [value, setValue] = useState('');
  return (
    <PasswordField
      label="Contraseña"
      name="password"
      autoComplete="new-password"
      hint="Entre 12 y 128 caracteres."
      value={value}
      onChange={setValue}
    />
  );
}

describe('TextField', () => {
  it('asocia la etiqueta, la ayuda y el error al campo', () => {
    render(
      <TextField label="Correo" name="correo" value="" onChange={vi.fn()} hint="Tu correo de trabajo." error="Escribe un correo válido." />,
    );

    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Tu correo de trabajo. Escribe un correo válido.');
  });

  it('no marca el campo como inválido si no hay error', () => {
    render(<TextField label="Correo" name="correo" value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Correo')).not.toHaveAttribute('aria-invalid');
  });
});

describe('PasswordField', () => {
  it('muestra y oculta la contraseña sin borrar lo escrito', () => {
    render(<ControlledPassword />);
    const input = screen.getByLabelText('Contraseña');
    fireEvent.change(input, { target: { value: 'una-clave-larga' } });
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('una-clave-larga');

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('no bloquea el pegado y permite el autocompletado de gestores', () => {
    render(<ControlledPassword />);
    const input = screen.getByLabelText('Contraseña');

    expect(fireEvent.paste(input)).toBe(true);
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toHaveAccessibleDescription('Entre 12 y 128 caracteres.');
  });

  it('el botón de mostrar no envía el formulario', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ControlledPassword />
      </form>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('SubmitButton', () => {
  function renderForm(pending: boolean) {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SubmitButton pending={pending} pendingLabel="Enviando…">
          Iniciar sesión
        </SubmitButton>
      </form>,
    );
    return onSubmit;
  }

  it('envía el formulario en reposo', () => {
    const onSubmit = renderForm(false);

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('no permite un doble envío, y conserva la posibilidad de tener el foco', () => {
    const onSubmit = renderForm(true);
    const button = screen.getByRole('button', { name: 'Enviando…' });

    fireEvent.click(button);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
  });
});

describe('StatusMessage', () => {
  it('anuncia los errores como alerta y el resto como estado', () => {
    render(
      <>
        <StatusMessage tone="error">No se pudo completar.</StatusMessage>
        <StatusMessage tone="success">Listo.</StatusMessage>
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo completar.');
    expect(screen.getByRole('status')).toHaveTextContent('Listo.');
  });

  it('puede recibir el foco para llevar a la persona al resultado', () => {
    render(<StatusMessage tone="info">Revisa tu correo.</StatusMessage>);
    const status = screen.getByRole('status');

    status.focus();

    expect(status).toHaveFocus();
  });
});

describe('AuthPage', () => {
  it('identifica el trámite por su título, sin depender del color, y lleva el nombre en el panel institucional', () => {
    render(
      <MemoryRouter>
        <AuthPage flow="registro" title="Crear cuenta" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Crear cuenta' })).toBeInTheDocument();
    expect(document.title).toBe('Crear cuenta · OMR-PreICFES');
    expect(screen.getByRole('banner')).toHaveTextContent('OMR-PreICFES');
    // La hoja OMR es decorativa: no se anuncia.
    expect(screen.getByRole('banner').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('la plantilla no añade trámites públicos: cada pantalla enlaza los suyos, y las privadas ninguno', () => {
    render(
      <MemoryRouter>
        <AuthPage flow="acceso" title="Inicio" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
