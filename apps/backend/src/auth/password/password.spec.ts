import { ServiceUnavailableError } from '../../common/auth-errors';
import { Argon2Gate } from './argon2-gate';
import { PasswordHasher } from './password-hasher';
import { checkPasswordPolicy } from './password-policy';

const gate = (maxConcurrency = 2, queueMax = 8, queueTimeoutMs = 5_000) =>
  new Argon2Gate({ maxConcurrency, queueMax, queueTimeoutMs, retryAfterS: 5 });

// T-07 (CA-03, RN-05, RNF-01, RNF-02).
describe('PasswordPolicy y PasswordHasher (T-07)', () => {
  it('11 caracteres → rechazada; frase de 12 → aceptada; 128 sí y 129 no; sin reglas de composición', () => {
    expect(checkPasswordPolicy('a'.repeat(11))).toEqual({ ok: false, reason: 'DEMASIADO_CORTA' });
    expect(checkPasswordPolicy('mi casa azul')).toEqual({ ok: true });
    expect(checkPasswordPolicy('a'.repeat(128))).toEqual({ ok: true });
    expect(checkPasswordPolicy('a'.repeat(129))).toEqual({ ok: false, reason: 'DEMASIADO_LARGA' });
    expect(checkPasswordPolicy('frase de sesenta y cuatro caracteres sin mayusculas ni simbolos!')).toEqual({ ok: true });
  });

  it('cuenta puntos de código (12 emojis = 12 caracteres)', () => {
    expect(checkPasswordPolicy('🙂'.repeat(12))).toEqual({ ok: true });
    expect(checkPasswordPolicy('🙂'.repeat(11))).toEqual({ ok: false, reason: 'DEMASIADO_CORTA' });
  });

  it('RNF-01: el hash es $argon2id$ con los parámetros OWASP y verifica', async () => {
    const hasher = new PasswordHasher(gate());
    const hash = await hasher.hash('mi casa azul de prueba');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain('mi casa azul');
    await expect(hasher.verify(hash, 'mi casa azul de prueba')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'otra contraseña larga')).resolves.toBe(false);
    await expect(hasher.verifyDummy('cualquier cosa')).resolves.toBe(false);
  });
});

// T-42 (RNF-07): Argon2Gate por proceso.
describe('Argon2Gate (T-42)', () => {
  it('nunca ejecuta más tareas simultáneas que el máximo; con la cola llena → 503 sin ejecutar', async () => {
    const g = gate(2, 2, 5_000);
    let running = 0;
    let maxRunning = 0;
    let executed = 0;
    const task = () =>
      g.run(async () => {
        executed += 1;
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 30));
        running -= 1;
        return true;
      });
    const results = await Promise.allSettled(Array.from({ length: 10 }, task));
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(maxRunning).toBe(2);
    expect(fulfilled).toHaveLength(4);
    expect(executed).toBe(4);
    expect(rejected).toHaveLength(6);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ServiceUnavailableError);
      expect(r.reason).toMatchObject({ type: 'servicio-saturado', retryAfterS: 5 });
    }
    expect(g.metrics()).toMatchObject({ active: 0, queued: 0, rejected: 6, maxObservedActive: 2 });
  });

  it('espera vencida en la cola → 503 y la tarea no se ejecuta', async () => {
    const g = gate(1, 5, 20);
    let release!: () => void;
    const blocker = g.run(() => new Promise<void>((r) => (release = r)));
    const waiting = jest.fn(() => Promise.resolve());
    await expect(g.run(waiting)).rejects.toMatchObject({ type: 'servicio-saturado' });
    expect(waiting).not.toHaveBeenCalled();
    release();
    await blocker;
  });

  it('todas las llamadas de PasswordHasher, incluido el hash ficticio, pasan por el gate', async () => {
    const g = gate(1, 0, 10);
    const hasher = new PasswordHasher(g);
    let release!: () => void;
    const blocker = g.run(() => new Promise<void>((r) => (release = r)));
    await expect(hasher.verifyDummy('x'.repeat(12))).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(hasher.hash('x'.repeat(12))).rejects.toBeInstanceOf(ServiceUnavailableError);
    release();
    await blocker;
  });
});
