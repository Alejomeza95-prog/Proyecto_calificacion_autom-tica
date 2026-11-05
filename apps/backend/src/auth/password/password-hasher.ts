import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Argon2Gate } from './argon2-gate';

/** Parámetros mínimos OWASP vigentes para Argon2id (plan §11, RNF-01, DEC-02). */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash y verificación con Argon2id (T-07). Todas las llamadas pasan por `Argon2Gate` (DEC-17).
 * `verifyDummy` ejecuta una verificación contra un hash ficticio para equilibrar el tiempo
 * cuando la cuenta no existe (RN-04).
 */
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly gate: Argon2Gate) {}

  hash(password: string): Promise<string> {
    return this.gate.run(() => argon2.hash(password, ARGON2_OPTIONS));
  }

  verify(hash: string, password: string): Promise<boolean> {
    return this.gate.run(() => argon2.verify(hash, password));
  }

  async verifyDummy(password: string): Promise<false> {
    const hash = await this.getDummyHash();
    await this.gate.run(() => argon2.verify(hash, password));
    return false;
  }

  /** El hash ficticio se genera una vez, también a través del gate; si falla, se reintenta luego. */
  private getDummyHash(): Promise<string> {
    if (!this.dummyHash) {
      const pending = this.hash(randomBytes(32).toString('base64url'));
      this.dummyHash = pending;
      pending.catch(() => {
        if (this.dummyHash === pending) this.dummyHash = undefined;
      });
    }
    return this.dummyHash;
  }

  /** Hash de un valor aleatorio descartado: cuenta sin contraseña utilizable (DEC-08). */
  unusableHash(): Promise<string> {
    return this.hash(randomBytes(32).toString('base64url'));
  }
}
