import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../src/authz/decorators';
import { bootHttpApp, type HttpHarness } from './support/http-app';

/**
 * T-10 / RN-12 (plan §11): un error no previsto que lleva secretos en el mensaje (URI de MongoDB con
 * usuario y contraseña, contraseña, token, `Bearer`) se responde con un 500 problem+json genérico y
 * **los logs reales** del proceso (stdout y stderr del `RedactingLogger` instalado por `configureApp`)
 * no contienen ninguno de esos valores, pero sí la información útil para diagnosticar.
 */
const SECRETS = ['usuario-db', 'clave-db-super', 'hunter2', 'tok-123456', 'opaco.987'];
const MESSAGE =
  'fallo de conexión mongodb://usuario-db:clave-db-super@mongo:27017/omr?authSource=admin ' +
  'password=hunter2 token=tok-123456 Authorization: Bearer opaco.987';

class ConexionFallidaError extends Error {
  constructor() {
    super(MESSAGE);
    this.name = 'ConexionFallidaError';
  }
}

@Public()
@Controller('prueba-logs')
class FailingController {
  @Get()
  fail(): never {
    throw new ConexionFallidaError();
  }
}

@Module({ controllers: [FailingController] })
class FailingModule {}

describe('redacción de secretos en los logs de errores HTTP (T-10, e2e)', () => {
  let h: HttpHarness;

  beforeAll(async () => {
    h = await bootHttpApp('e2e_logs', { imports: [FailingModule] });
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  it('respuesta 500 genérica y logs reales sin secretos, con el diagnóstico útil', async () => {
    const written: string[] = [];
    const capture = (chunk: unknown): boolean => {
      written.push(typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      return true;
    };
    const out = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
    let res;
    try {
      res = await h.http().get('/api/v1/prueba-logs');
    } finally {
      out.mockRestore();
      err.mockRestore();
    }

    // Respuesta HTTP: problem+json genérico, sin mensaje original.
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(res.body).toEqual({ type: 'urn:omr-preicfes:problema:error-interno', title: 'Error interno', status: 500 });
    for (const secret of [...SECRETS, 'mongodb://', 'ConexionFallidaError']) expect(res.text).not.toContain(secret);

    // Logs reales capturados.
    const logs = written.join('');
    expect(logs).toContain('ProblemJsonFilter');
    for (const secret of SECRETS) expect(logs).not.toContain(secret);
    // Se conserva lo útil: tipo de error, mensaje sin secretos, host/puerto/base y la traza.
    expect(logs).toContain('ConexionFallidaError: fallo de conexión mongodb://[REDACTADO]@mongo:27017/omr?authSource=admin');
    expect(logs).toContain('password=[REDACTADO]');
    expect(logs).toContain('log-redaction.e2e-spec.ts');
  });
});
