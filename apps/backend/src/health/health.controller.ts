import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
}

/**
 * Health check del proceso (plan HT-CORE-01 §8, DEC-15). Solo indica que la API responde;
 * no consulta MongoDB ni Redis porque el esqueleto todavía no se conecta a ellos.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
