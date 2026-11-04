import { ServiceUnavailableError } from '../../common/auth-errors';

export interface Argon2GateOptions {
  readonly maxConcurrency: number;
  readonly queueMax: number;
  readonly queueTimeoutMs: number;
  readonly retryAfterS: number;
}

export interface Argon2GateMetrics {
  readonly active: number;
  readonly queued: number;
  readonly rejected: number;
  readonly maxObservedActive: number;
}

interface Waiter {
  readonly grant: () => void;
  readonly timer: NodeJS.Timeout;
}

/**
 * `Argon2Gate` por proceso (plan §11, DEC-17, T-42): semáforo de verificaciones Argon2id simultáneas,
 * cola con tope y espera máxima. Fuera de eso rechaza con 503 `servicio-saturado` **sin ejecutar**
 * la función. Toda llamada a Argon2id pasa por aquí, incluido el hash ficticio.
 */
export class Argon2Gate {
  private active = 0;
  private rejected = 0;
  private maxObservedActive = 0;
  private readonly queue: Waiter[] = [];

  constructor(private readonly options: Argon2GateOptions) {}

  metrics(): Argon2GateMetrics {
    return {
      active: this.active,
      queued: this.queue.length,
      rejected: this.rejected,
      maxObservedActive: this.maxObservedActive,
    };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private saturated(): ServiceUnavailableError {
    this.rejected += 1;
    return new ServiceUnavailableError('servicio-saturado', this.options.retryAfterS);
  }

  private acquire(): Promise<void> {
    if (this.active < this.options.maxConcurrency) {
      this.take();
      return Promise.resolve();
    }
    if (this.queue.length >= this.options.queueMax) return Promise.reject(this.saturated());
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => {
          clearTimeout(waiter.timer);
          this.take();
          resolve();
        },
        timer: setTimeout(() => {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) this.queue.splice(index, 1);
          reject(this.saturated());
        }, this.options.queueTimeoutMs),
      };
      this.queue.push(waiter);
    });
  }

  private take(): void {
    this.active += 1;
    this.maxObservedActive = Math.max(this.maxObservedActive, this.active);
  }

  private release(): void {
    this.active -= 1;
    this.queue.shift()?.grant();
  }
}
