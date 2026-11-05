import { currentCorrelationId } from '../observability/request-context';
import { createHmac } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { AuditoriaAuth } from './auditoria-auth.schema';
import type { AuditResult, AuthEvent } from './auth-event';

/**
 * Entrada de auditoría. Solo admite campos sin secretos: el tipo no tiene dónde poner un correo,
 * un token, una contraseña ni un hash (RN-12). La IP se guarda como HMAC con `AUDIT_IP_PEPPER`.
 */
export interface AuditEntry {
  readonly evento: AuthEvent;
  readonly resultado: AuditResult;
  readonly usuarioId?: Types.ObjectId | null;
  readonly ip?: string | null;
  readonly correlationId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditoriaAuth.name) private readonly auditoria: Model<AuditoriaAuth>,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  hashIp(ip: string): string {
    return createHmac('sha256', this.config.auditIpPepper).update(ip).digest('hex');
  }

  async record(entry: AuditEntry): Promise<void> {
    await this.auditoria.create({
      evento: entry.evento,
      resultado: entry.resultado,
      usuario_id: entry.usuarioId ?? null,
      ip_hash: entry.ip ? this.hashIp(entry.ip) : null,
      // T-47: identificador de la solicitud en curso (AsyncLocalStorage), también en envíos diferidos.
      correlation_id: entry.correlationId ?? currentCorrelationId() ?? null,
    });
  }

  /**
   * Variante que no interrumpe el flujo principal si la escritura falla: registra el fallo en el log
   * (redactado) en lugar de propagarlo. Se usa en caminos donde la respuesta ya está decidida.
   */
  async recordSafely(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (error) {
      this.logger.error(`No se pudo auditar el evento ${entry.evento}`, error instanceof Error ? error.message : undefined);
    }
  }
}
