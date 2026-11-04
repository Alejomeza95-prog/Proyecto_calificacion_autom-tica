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

  it('credenciales en URI: oculta usuario y contraseña y conserva esquema, host, puerto y ruta', () => {
    expect(redactText('Error: mongodb://usuario:clave@host fallo')).toBe(`Error: mongodb://${REDACTED}@host fallo`);
    expect(redactText('mongodb://omr:S3cr3t%40x@mongo:27017/omr?authSource=admin')).toBe(
      `mongodb://${REDACTED}@mongo:27017/omr?authSource=admin`,
    );
    expect(redactText('redis://:clave-redis@redis:6379/0')).toBe(`redis://${REDACTED}@redis:6379/0`);
    expect(redactText('smtp://usuario@smtp.example.test:587')).toBe(`smtp://${REDACTED}@smtp.example.test:587`);
    // Sin credenciales, la URI queda igual.
    expect(redactText('conectando a mongodb://mongo:27017/omr')).toBe('conectando a mongodb://mongo:27017/omr');
  });

  it('pares clave=valor sensibles y credenciales HTTP en texto libre', () => {
    const out = redactText(
      'fallo password=hunter2 pwd: "otra clave" api_key=AKIA123 token=abc&x=1 client_secret=zzz Authorization: Bearer opaco.123 Basic dXNlcjpwYXNz',
    );
    for (const secret of ['hunter2', 'otra clave', 'AKIA123', 'abc', 'zzz', 'opaco.123', 'dXNlcjpwYXNz']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('fallo password=');
    expect(out).toContain('x=1');
  });

  it('Error: redacta mensaje y stack y conserva nombre y marcos de la traza', () => {
    const error = new Error('mongodb://usuario:clave@mongo:27017/omr fallo de conexión');
    const out = redact(error) as { name: string; message: string; stack?: string };
    expect(out.name).toBe('Error');
    expect(out.message).toBe(`mongodb://${REDACTED}@mongo:27017/omr fallo de conexión`);
    expect(out.stack).not.toContain('clave');
    expect(out.stack).toContain('redact.spec.ts');
  });

  it('no altera textos sin secretos ni identificadores cortos', () => {
    expect(redactText('Correo enviado (plantilla VERIFICACION)')).toBe('Correo enviado (plantilla VERIFICACION)');
    expect(redact({ usuario_id: '64a000000000000000000001' })).toEqual({ usuario_id: '64a000000000000000000001' });
  });
});
