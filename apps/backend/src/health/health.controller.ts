import { Controller, Get } from '@nestjs/common';
import { Public } from '../authz/decorators';

export interface HealthStatus {
  status: 'ok';
}

/**
 * Health check del proceso (plan HT-CORE-01 §8, DEC-15). Solo indica que la API responde;
 * no consulta MongoDB ni Redis porque el esqueleto todavía no se conecta a ellos.
 * Ruta pública explícita (`@Public()`, HT-AUTH-01 plan §11): el `JwtAuthGuard` es global.
 */
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
