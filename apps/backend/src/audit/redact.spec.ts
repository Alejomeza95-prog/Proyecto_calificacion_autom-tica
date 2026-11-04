import { REDACTED, redact, redactText } from './redact';

// T-10 (CA-12, RN-12): redactor del logger.
describe('redactor de logs (T-10)', () => {
  it('enmascara por clave: password, token, cookie, authorization, correo y *_hash', () => {
    const input = {
      password: 'mi casa azul',
      captchaToken: 't',
      headers: { cookie: 'refresh=x', authorization: 'Bearer y' },
      correo: 'ana@example.test',
      token_hash: 'a'.repeat(64),
      refresh_hashes_previos: ['b'.repeat(64)],
      evento: 'LOGIN_OK',
    };
    expect(redact(input)).toEqual({
      password: REDACTED,
      captchaToken: REDACTED,
      headers: { cookie: REDACTED, authorization: REDACTED },
      correo: REDACTED,
      token_hash: REDACTED,
      refresh_hashes_previos: REDACTED,
      evento: 'LOGIN_OK',
    });
  });

  it('enmascara por patrón en texto libre: enlaces con token, correos, SHA-256, Argon2, JWT y tokens de 43', () => {
    const token = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v';
    const text = [
      `enlace http://localhost:5173/verificar-correo#token=${token}`,
      'correo ana@example.test',
      `hash ${'c'.repeat(64)}`,
      'argon $argon2id$v=19$m=19456,t=2,p=1$abc$def',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_nature',
      `crudo ${token}`,
    ].join('\n');
    const out = redactText(text);
    for (const secret of [token, 'ana@example.test', 'c'.repeat(64), '$argon2id$', 'eyJhbGciOiJIUzI1NiJ9']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('enlace');
  });

  it('no altera textos sin secretos ni identificadores cortos', () => {
    expect(redactText('Correo enviado (plantilla VERIFICACION)')).toBe('Correo enviado (plantilla VERIFICACION)');
    expect(redact({ usuario_id: '64a000000000000000000001' })).toEqual({ usuario_id: '64a000000000000000000001' });
  });
});
