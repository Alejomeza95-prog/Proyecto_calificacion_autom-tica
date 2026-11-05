import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { AuthConfig } from '../../src/config/auth-config';
import { NodemailerSmtpMailSender } from '../../src/mail/mail-sender';

type Mode = 'sin-starttls' | 'sin-saludo' | 'sin-respuesta-ehlo';

/**
 * Servidor SMTP mínimo en 127.0.0.1, sin TLS (DEC-26, T-12). Registra los comandos recibidos para
 * comprobar que, cuando el cifrado es obligatorio, el mensaje nunca se transmite en claro.
 */
class FakeSmtp {
  private server!: Server;
  private readonly sockets = new Set<Socket>();
  mode: Mode = 'sin-starttls';
  readonly commands: string[] = [];

  async start(): Promise<void> {
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      socket.on('error', () => undefined);
      if (this.mode === 'sin-saludo') return;
      socket.write('220 fake.example.test ESMTP\r\n');
      let buffer = '';
      let inData = false;
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('latin1');
        if (inData) {
          if (!buffer.includes('\r\n.\r\n')) return;
          inData = false;
          buffer = '';
          this.commands.push('<DATOS>');
          socket.write('250 2.0.0 aceptado\r\n');
          return;
        }
        let index: number;
        while ((index = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const verb = line.split(' ')[0]?.toUpperCase() ?? '';
          this.commands.push(verb);
          if (verb === 'EHLO') {
            if (this.mode === 'sin-respuesta-ehlo') return;
            socket.write('250-fake.example.test\r\n250 8BITMIME\r\n'); // no anuncia STARTTLS
          } else if (verb === 'DATA') {
            inData = true;
            socket.write('354 adelante\r\n');
            return;
          } else if (verb === 'QUIT') {
            socket.end('221 adiós\r\n');
          } else {
            socket.write('250 ok\r\n');
          }
        }
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

const MESSAGE = { to: 'destino@example.test', subject: 'Prueba DEC-26', text: 'texto', html: '<p>texto</p>' };

describe('SMTP: cifrado obligatorio y tiempos máximos (DEC-26, integración)', () => {
  const fake = new FakeSmtp();

  const sender = (overrides: Partial<AuthConfig['smtp']> = {}) =>
    new NodemailerSmtpMailSender(
      {
        host: '127.0.0.1',
        port: fake.port,
        secure: false,
        requireTls: true,
        user: undefined,
        password: undefined,
        connectionTimeoutMs: 2_000,
        greetingTimeoutMs: 2_000,
        socketTimeoutMs: 2_000,
        ...overrides,
      },
      'OMR PreICFES <no-responder@example.test>',
    );

  beforeAll(async () => {
    await fake.start();
  });

  afterAll(async () => {
    await fake.stop();
  });

  beforeEach(() => {
    fake.mode = 'sin-starttls';
    fake.commands.length = 0;
  });

  it('con STARTTLS obligatorio y un servidor que no lo ofrece → el envío falla y el mensaje no se transmite', async () => {
    await expect(sender().send(MESSAGE)).rejects.toThrow();
    expect(fake.commands).toContain('EHLO');
    expect(fake.commands).not.toContain('MAIL');
    expect(fake.commands).not.toContain('<DATOS>');
  });

  it('sin cifrado obligatorio (solo local, p. ej. Mailpit) el mismo servidor acepta el envío', async () => {
    await expect(sender({ requireTls: false }).send(MESSAGE)).resolves.toBeUndefined();
    expect(fake.commands).toEqual(expect.arrayContaining(['EHLO', 'MAIL', 'RCPT', 'DATA', '<DATOS>']));
  });

  it('TLS implícito contra un servidor sin TLS → el envío falla sin transmitir el mensaje', async () => {
    await expect(sender({ secure: true, requireTls: false }).send(MESSAGE)).rejects.toThrow();
    expect(fake.commands).not.toContain('MAIL');
  });

  it('servidor que no saluda → falla al vencer SMTP_GREETING_TIMEOUT_MS (tiempo finito)', async () => {
    fake.mode = 'sin-saludo';
    const started = performance.now();
    await expect(sender({ greetingTimeoutMs: 150 }).send(MESSAGE)).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(1_500);
  });

  it('servidor que deja de responder → falla al vencer SMTP_SOCKET_TIMEOUT_MS (tiempo finito)', async () => {
    fake.mode = 'sin-respuesta-ehlo';
    const started = performance.now();
    await expect(sender({ socketTimeoutMs: 150 }).send(MESSAGE)).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(1_500);
  });
});
