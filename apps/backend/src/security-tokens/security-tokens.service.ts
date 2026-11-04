import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, Types } from 'mongoose';
import { CLOCK, type Clock } from '../common/clock';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';
import { TokenSeguridad } from './token-seguridad.schema';
import type { TokenPurpose } from './token-purpose';

/** Token crudo: 32 bytes aleatorios en Base64URL (43 caracteres), 256 bits (DEC-03). */
export const TOKEN_BYTES = 32;

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface IssuedToken {
  /** Solo viaja por correo; nunca se persiste ni se registra (RN-06, DEC-09). */
  readonly token: string;
  readonly tokenId: Types.ObjectId;
  readonly expiraEn: Date;
}

export interface ConsumedToken {
  readonly tokenId: Types.ObjectId;
  readonly usuarioId: Types.ObjectId;
}

/**
 * Emisión, invalidación y consumo atómico de tokens de un solo uso (plan §5, DEC-03, T-08).
 * Solo se guarda el SHA-256. La expiración se comprueba siempre en la consulta.
 */
@Injectable()
export class SecurityTokensService {
  constructor(
    @InjectModel(TokenSeguridad.name) private readonly tokens: Model<TokenSeguridad>,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private ttlMs(proposito: TokenPurpose): number {
    switch (proposito) {
      case 'VERIFICAR_CORREO':
        return this.config.ttl.verifyTokenMs;
      case 'RESTABLECER_PASSWORD':
        return this.config.ttl.resetTokenMs;
      case 'ACTIVAR_CUENTA':
        return this.config.ttl.activationTokenMs;
    }
  }

  /**
   * Invalida los tokens vigentes del mismo usuario y propósito y emite uno nuevo (RN-06).
   * Si la inserción falla, no queda ningún token válido (estado compensatorio aceptado, plan §5).
   */
  async issue(usuarioId: Types.ObjectId, proposito: TokenPurpose): Promise<IssuedToken> {
    const now = this.clock.now();
    await this.tokens
      .updateMany({ usuario_id: usuarioId, proposito, usado_en: null, invalidado_en: null }, { $set: { invalidado_en: now } })
      .exec();
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiraEn = new Date(now.getTime() + this.ttlMs(proposito));
    const created = await this.tokens.create({
      usuario_id: usuarioId,
      proposito,
      token_hash: sha256Hex(token),
      expira_en: expiraEn,
    });
    return { token, tokenId: created._id, expiraEn };
  }

  /**
   * Busca el registro de un token **existente**, sin filtrar por estado, para el límite por enlace
   * (plan §5). Devuelve solo su `_id`: el token y su hash nunca salen de este servicio.
   */
  async findExistingId(token: string, proposito: TokenPurpose): Promise<Types.ObjectId | null> {
    const found = await this.tokens.findOne({ token_hash: sha256Hex(token), proposito }, { _id: 1 }).lean().exec();
    return found?._id ?? null;
  }

  /**
   * Consumo atómico: vigente, no usado, no invalidado y no vencido. Dos usos simultáneos no pueden
   * tener éxito a la vez (CA-10). Devuelve `null` si no es válido, sin distinguir la causa.
   */
  async consume(token: string, proposito: TokenPurpose): Promise<ConsumedToken | null> {
    const now = this.clock.now();
    const consumed = await this.tokens
      .findOneAndUpdate(
        { token_hash: sha256Hex(token), proposito, usado_en: null, invalidado_en: null, expira_en: { $gt: now } },
        { $set: { usado_en: now } },
        { projection: { _id: 1, usuario_id: 1 } },
      )
      .lean()
      .exec();
    return consumed ? { tokenId: consumed._id, usuarioId: consumed.usuario_id } : null;
  }
}
