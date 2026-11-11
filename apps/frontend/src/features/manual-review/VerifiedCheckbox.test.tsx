import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { canVerify, VALORES_RESUELTOS, type ValorResuelto } from './verification.ts';
import { VerifiedCheckbox } from './VerifiedCheckbox.tsx';

/** Pantalla mínima de resolución, solo para la prueba: elegir valor y marcar la casilla. */
function Resolver({ initial = null }: { readonly initial?: ValorResuelto | null }) {
  const [valor, setValor] = useState<ValorResuelto | null>(initial);
  const [verificada, setVerificada] = useState(false);
  return (
    <>
      <label>
        Valor resuelto
        <select value={valor ?? ''} onChange={(e) => setValor(e.target.value === '' ? null : (e.target.value as ValorResuelto))}>
          <option value="">—</option>
          {VALORES_RESUELTOS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <VerifiedCheckbox valorResuelto={valor} checked={verificada} onChange={setVerificada} />
    </>
  );
}

// HT-AUTH-03 T-26 (CA-13, RN-16).
describe('casilla «Verificada» (CA-13, RN-16)', () => {
  it('canVerify: solo con valor resuelto; BLANK es válido', () => {
    expect([...VALORES_RESUELTOS]).toEqual(['A', 'B', 'C', 'D', 'BLANK']);
    expect(canVerify(null)).toBe(false);
    expect(canVerify('BLANK')).toBe(true);
  });

  it('deshabilitada y desmarcada sin valor; se habilita al elegirlo; nunca se marca sola', () => {
    render(<Resolver />);
    const box = screen.getByRole('checkbox', { name: 'Verificada' });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(screen.getByText('Elige primero el valor resuelto de la marca.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Valor resuelto'), { target: { value: 'BLANK' } });
    expect(box).toBeEnabled();
    expect(box).not.toBeChecked();

    fireEvent.click(box);
    expect(box).toBeChecked();
  });

  it('quitar el valor desmarca y deshabilita la casilla', () => {
    render(<Resolver initial="C" />);
    const box = screen.getByRole('checkbox', { name: 'Verificada' });
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.change(screen.getByLabelText('Valor resuelto'), { target: { value: '' } });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
  });

  it('una resolución ya confirmada queda bloqueada', () => {
    const onChange = vi.fn();
    render(<VerifiedCheckbox valorResuelto="A" checked locked onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Verificada' });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(screen.getByText('Resolución confirmada.')).toBeInTheDocument();
  });
});
