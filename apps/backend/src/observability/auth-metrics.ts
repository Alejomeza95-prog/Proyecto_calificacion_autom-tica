import { collectDefaultMetrics, Counter, Gauge, Registry } from '@prometheus-io/client';
import type { Argon2GateMetrics } from '../auth/password/argon2-gate';

/** Resultado de una solicitud HTTP, por clase de estado (etiqueta acotada). */
export type RequestResult = 'exito' | 'error_cliente' | 'error_servidor';
export type CaptchaResult = 'valido' | 'invalido' | 'no_disponible';
export type MailResult = 'enviado' | 'fallido' | 'descartado';

/** Etiqueta `problema` cuando la respuesta no es un problem+json. */
export const NO_PROBLEM = 'ninguno';

export function resultForStatus(status: number): RequestResult {
  if (status >= 500) return 'error_servidor';
  if (status >= 400) return 'error_cliente';
  return 'exito';
}

/**
 * Métricas de autenticación (T-47, DEC-25, plan §13) con `@prometheus-io/client` en un registro propio
 * (no el global). **Etiquetas solo de conjuntos acotados**: ruta (plantilla de la ruta, no la URL),
 * resultado y tipo de problema. Nunca correo, IP, `usuario_id`, token, plantilla ni identificadores.
 * - `omr_auth_solicitudes_total{ruta,resultado,problema}`: login (éxito, `credenciales-invalidas`,
 *   `desafio-requerido`), 429 (`demasiados-intentos`) y 503 (`limitador-no-disponible`,
 *   `servicio-saturado`, `verificacion-no-disponible`) de todas las rutas de `/api/v1/auth`.
 * - `omr_auth_captcha_verificaciones_total{resultado}`: desafíos verificados con el proveedor.
 * - `omr_auth_correos_total{resultado}`: envíos de `MailDispatcher`.
 * - `omr_auth_argon2_*`: lectura de `Argon2Gate.metrics()` en cada recolección (sin duplicar contadores).
 * - Métricas del proceso (CPU, memoria, event loop) solo cuando se expone el endpoint interno.
 */
export class AuthMetrics {
  readonly registry = new Registry();
  private readonly requests: Counter<'ruta' | 'resultado' | 'problema'>;
  private readonly captcha: Counter<'resultado'>;
  private readonly mail: Counter<'resultado'>;
  private processMetrics = false;

  constructor(argon2?: { metrics(): Argon2GateMetrics }) {
    const registers = [this.registry];
    this.requests = new Counter({
      name: 'omr_auth_solicitudes_total',
      help: 'Solicitudes a /api/v1/auth por ruta, resultado y tipo de problema',
      labelNames: ['ruta', 'resultado', 'problema'] as const,
      registers,
    });
    this.captcha = new Counter({
      name: 'omr_auth_captcha_verificaciones_total',
      help: 'Verificaciones de CAPTCHA con el proveedor por resultado',
      labelNames: ['resultado'] as const,
      registers,
    });
    this.mail = new Counter({
      name: 'omr_auth_correos_total',
      help: 'Correos de autenticación por resultado del envío',
      labelNames: ['resultado'] as const,
      registers,
    });
    if (argon2) {
      const gauge = (name: string, help: string, pick: (m: Argon2GateMetrics) => number) =>
        new Gauge({
          name,
          help,
          registers,
          collect() {
            this.set(pick(argon2.metrics()));
          },
        });
      gauge('omr_auth_argon2_en_curso', 'Verificaciones Argon2id en curso en este proceso', (m) => m.active);
      gauge('omr_auth_argon2_en_cola', 'Verificaciones Argon2id en espera en la cola de Argon2Gate', (m) => m.queued);
      gauge('omr_auth_argon2_rechazadas', 'Verificaciones rechazadas por saturación desde el arranque (acumulado)', (m) => m.rejected);
      gauge('omr_auth_argon2_max_en_curso', 'Máximo de verificaciones simultáneas observado desde el arranque', (m) => m.maxObservedActive);
    }
  }

  recordRequest(ruta: string, status: number, problema: string = NO_PROBLEM): void {
    this.requests.inc({ ruta, resultado: resultForStatus(status), problema });
  }

  recordCaptcha(resultado: CaptchaResult): void {
    this.captcha.inc({ resultado });
  }

  recordMail(resultado: MailResult): void {
    this.mail.inc({ resultado });
  }

  /** CPU, memoria y event loop del proceso (plan §13). Solo una vez y solo si se expone el endpoint. */
  enableProcessMetrics(): void {
    if (this.processMetrics) return;
    this.processMetrics = true;
    collectDefaultMetrics({ register: this.registry, prefix: 'omr_auth_proceso_' });
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
