import { Inject, Injectable, Logger, type BeforeApplicationShutdown } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { AuthMetrics } from '../observability/auth-metrics';
import { MAIL_SENDER, type MailMessage, type MailSender } from './mail-sender';
import type { MailTemplate } from './mail-templates';

export interface MailJob {
  readonly template: MailTemplate;
  readonly usuarioId: Types.ObjectId | null;
  /** El mensaje (con el enlace) vive solo en memoria y se descarta al terminar el envío (DEC-09). */
  readonly message: MailMessage;
}

/**
 * Envío en el mismo proceso, **después** de responder (DEC-09, plan §9.2, T-12):
 * - `dispatch` desacopla el envío con `setImmediate` y nunca persiste el mensaje.
 * - Un fallo SMTP se audita como `CORREO_NO_ENVIADO`, sin enlace ni correo; no hay reintento automático.
 * - El log del envío solo registra la plantilla, nunca el destinatario ni el enlace.
 * - Al apagar (`SIGTERM`), deja de aceptar envíos y espera los pendientes hasta `MAIL_DRAIN_TIMEOUT_MS`.
 */
@Injectable()
export class MailDispatcher implements BeforeApplicationShutdown {
  private readonly logger = new Logger(MailDispatcher.name);
  private readonly pending = new Set<Promise<void>>();
  private accepting = true;

  constructor(
    @Inject(MAIL_SENDER) private readonly sender: MailSender,
    private readonly audit: AuditService,
    @Inject(AUTH_CONFIG) private readonly config: Pick<AuthConfig, 'mailDrainTimeoutMs'>,
    private readonly metrics: AuthMetrics,
  ) {}

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Programa el envío. Devuelve `false` si el proceso ya está apagándose. */
  dispatch(job: MailJob): boolean {
    if (!this.accepting) {
      this.logger.warn(`Envío descartado durante el apagado (plantilla ${job.template})`);
      this.metrics.recordMail('descartado');
      return false;
    }
    const task: Promise<void> = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        await this.send(job);
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
    return true;
  }

  /**
   * Envía **ahora** y espera el resultado (T-35): solo para el comando `bootstrap:admin`, que no responde
   * a ninguna solicitud HTTP y debe informar a quien opera si el envío falló (mensaje genérico, DEC-08).
   * Mismo registro y auditoría que `dispatch`; el envío cuenta como pendiente para el drenaje.
   */
  async deliver(job: MailJob): Promise<boolean> {
    if (!this.accepting) {
      this.logger.warn(`Envío descartado durante el apagado (plantilla ${job.template})`);
      this.metrics.recordMail('descartado');
      return false;
    }
    let ok = false;
    const task = this.send(job)
      .then((sent) => {
        ok = sent;
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
    await task;
    return ok;
  }

  private async send(job: MailJob): Promise<boolean> {
    try {
      await this.sender.send(job.message);
      this.logger.log(`Correo enviado (plantilla ${job.template})`);
      this.metrics.recordMail('enviado');
      return true;
    } catch {
      this.logger.error(`Correo no enviado (plantilla ${job.template})`);
      this.metrics.recordMail('fallido');
      await this.audit.recordSafely({ evento: 'CORREO_NO_ENVIADO', resultado: 'RECHAZADO', usuarioId: job.usuarioId });
      return false;
    }
  }

  /** Espera los envíos pendientes hasta `MAIL_DRAIN_TIMEOUT_MS`. Devuelve cuántos quedaron sin terminar. */
  async drain(): Promise<number> {
    this.accepting = false;
    if (this.pending.size === 0) return 0;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.config.mailDrainTimeoutMs);
    });
    await Promise.race([Promise.allSettled([...this.pending]), timeout]);
    clearTimeout(timer);
    if (this.pending.size > 0) this.logger.error(`${this.pending.size} correo(s) sin enviar al apagar`);
    return this.pending.size;
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.drain();
  }
}
