import { describe, expect, it } from 'vitest';
import { validateCorreo, validateNewPassword, validateNombre } from './validation.ts';

describe('validateNewPassword (RNF-02)', () => {
  it.each([
    ['11 caracteres', 'a'.repeat(11), false],
    ['12 caracteres', 'a'.repeat(12), true],
    ['128 caracteres', 'a'.repeat(128), true],
    ['129 caracteres', 'a'.repeat(129), false],
    ['11 emoji cuentan como 11', '😀'.repeat(11), false],
    ['12 emoji cuentan como 12, aunque ocupen 24 unidades', '😀'.repeat(12), true],
    ['128 emoji cuentan como 128', '😀'.repeat(128), true],
    ['solo espacios: no se recortan', ' '.repeat(12), true],
    ['sin reglas de composición', 'aaaaaaaaaaaa', true],
  ])('%s', (_name, value, valid) => {
    expect(validateNewPassword(value) === undefined).toBe(valid);
  });

  it('el error no repite la contraseña', () => {
    expect(validateNewPassword('corta')).not.toContain('corta');
  });
});

describe('validateCorreo', () => {
  it.each([
    ['persona@example.test', true],
    ['  persona@example.test  ', true],
    ['', false],
    ['   ', false],
    ['persona', false],
    ['persona@dominio', false],
    ['per sona@example.test', false],
    [`${'a'.repeat(250)}@b.co`, false],
  ])('%j', (value, valid) => {
    expect(validateCorreo(value) === undefined).toBe(valid);
  });
});

describe('validateNombre', () => {
  it.each([
    ['Ana', true],
    ['', false],
    ['   ', false],
    ['a'.repeat(120), true],
    ['a'.repeat(121), false],
  ])('%j', (value, valid) => {
    expect(validateNombre(value) === undefined).toBe(valid);
  });
});
