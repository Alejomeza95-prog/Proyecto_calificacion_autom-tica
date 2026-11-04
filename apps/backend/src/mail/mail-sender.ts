import { createTransport, type Transporter } from 'nodemailer';
import type { AuthConfig } from '../config/auth-config';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Puerto de envío de correo (DEC-09). */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_SENDER = Symbol('MAIL_SENDER');

/** Adaptador SMTP genérico con Nodemailer: sirve para cualquier proveedor con SMTP (DEC-09). */
export class NodemailerSmtpMailSender implements MailSender {
  private readonly transporter: Transporter;

  constructor(
    smtp: AuthConfig['smtp'],
    private readonly from: string,
  ) {
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

/** Adaptador en memoria: **solo pruebas** (unit e integración, DEC-05). Nunca envía correo real. */
export class InMemoryMailSender implements MailSender {
  readonly sent: MailMessage[] = [];
  failNext = 0;

  send(message: MailMessage): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('SMTP no disponible (simulado)'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  clear(): void {
    this.sent.length = 0;
  }
}
