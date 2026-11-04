/** Reloj inyectable: permite probar vencimientos sin esperar tiempo real (T-40). */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };
