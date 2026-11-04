import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { CLOCK, type Clock } from '../common/clock';
import { AUTH_CONFIG } from '../config/config.module';
import type { AuthConfig } from '../config/auth-config';

/** Claims del JWT de acceso (plan §9.1): sin rol ni institución (RN-15, DEC-11). */
export interface AccessTokenClaims {
  readonly sub: string;
  readonly sid: string;
  readonly cv: number;
  readonly iat: number;
  readonly exp: number;
}

export interface IssuedAccessToken {
  readonly accessToken: string;
  /** Segundos de vigencia (`JWT_ACCESS_TTL`). */
  readonly expiresIn: number;
}

const ALGORITHM = 'HS256';

function isClaims(value: unknown): value is AccessTokenClaims {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.sub === 'string' &&
    Types.ObjectId.isValid(c.sub) &&
    typeof c.sid === 'string' &&
    Types.ObjectId.isValid(c.sid) &&
    typeof c.cv === 'number' &&
    Number.isInteger(c.cv) &&
    c.cv >= 0 &&
    typeof c.iat === 'number' &&
    typeof c.exp === 'number'
  );
}

/**
 * JWT de acceso de `JWT_ACCESS_TTL` firmado con `JWT_ACCESS_SECRET` (DEC-01). La hora sale del
 * `Clock` inyectado, para probar el vencimiento con un reloj falso.
 */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private nowSeconds(): number {
    return Math.floor(this.clock.now().getTime() / 1_000);
  }

  issue(usuarioId: Types.ObjectId, sid: Types.ObjectId, cv: number): IssuedAccessToken {
    const expiresIn = Math.max(1, Math.floor(this.config.ttl.jwtAccessMs / 1_000));
    const accessToken = this.jwt.sign(
      { sub: usuarioId.toHexString(), sid: sid.toHexString(), cv, iat: this.nowSeconds() },
      { secret: this.config.jwtAccessSecret, algorithm: ALGORITHM, expiresIn },
    );
    return { accessToken, expiresIn };
  }

  /** Claims verificados (firma, algoritmo y vencimiento) o `null`. Nunca lanza. */
  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const claims: unknown = await this.jwt.verifyAsync(token, {
        secret: this.config.jwtAccessSecret,
        algorithms: [ALGORITHM],
        clockTimestamp: this.nowSeconds(),
      });
      return isClaims(claims) ? claims : null;
    } catch {
      return null;
    }
  }
}
