import { Inject, Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { LinkBuilder } from './link-builder';
import { MailDispatcher } from './mail-dispatcher';
import { renderTemplate, type MailTemplate } from './mail-templates';

export interface MailRecipient {
  readonly usuarioId: Types.ObjectId;
  readonly correo: string;
  readonly nombre: string;
}

/**
 * Correos de la cuenta (T-12). Construye el enlace con `LinkBuilder` y lo entrega a `MailDispatcher`;
 * el token crudo solo existe en el mensaje en memoria (RN-06, DEC-09).
 */
@Injectable()
export class MailService {
  constructor(
    private readonly links: LinkBuilder,
    private readonly dispatcher: MailDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: Pick<AuthConfig, 'ttl'>,
  ) {}

  private send(template: MailTemplate, to: MailRecipient, link?: string, vigenciaMs?: number): boolean {
    const rendered = renderTemplate(template, to.nombre, link, vigenciaMs);
    return this.dispatcher.dispatch({ template, usuarioId: to.usuarioId, message: { to: to.correo, ...rendered } });
  }

  sendVerification(to: MailRecipient, token: string, isResend = false): boolean {
    return this.send(
      isResend ? 'REENVIO_VERIFICACION' : 'VERIFICACION',
      to,
      this.links.build('verificarCorreo', token),
      this.config.ttl.verifyTokenMs,
    );
  }

  sendPasswordReset(to: MailRecipient, token: string): boolean {
    return this.send('RESTABLECIMIENTO', to, this.links.build('restablecerPassword', token), this.config.ttl.resetTokenMs);
  }

  sendActivation(to: MailRecipient, token: string): boolean {
    return this.send('ACTIVACION', to, this.links.build('activarCuenta', token), this.config.ttl.activationTokenMs);
  }

  sendPasswordChangedNotice(to: MailRecipient): boolean {
    return this.send('AVISO_CAMBIO_PASSWORD', to);
  }
}
