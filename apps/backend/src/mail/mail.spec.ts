import type { AuditService } from '../audit/audit.service';
import { withMinimumDuration } from '../common/min-duration';
import { LinkBuilder } from './link-builder';
import { AuthMetrics } from '../observability/auth-metrics';
import { MailDispatcher } from './mail-dispatcher';
import { InMemoryMailSender, type MailMessage, type MailSender } from './mail-sender';
import { MailService } from './mail.service';
import { describeDuration, renderTemplate } from './mail-templates';
import { Types } from 'mongoose';

const TOKEN = 'Q'.repeat(43);
const ttl = { jwtAccessMs: 1, sessionRefreshMs: 1, verifyTokenMs: 86_400_000, resetTokenMs: 1_800_000, activationTokenMs: 86_400_000 };

function setup(sender: MailSender = new InMemoryMailSender(), drainMs = 2_000) {
  const record = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve());
  const audit = { recordSafely: record } as unknown as AuditService;
  const dispatcher = new MailDispatcher(sender, audit, { mailDrainTimeoutMs: drainMs }, new AuthMetrics());
  const service = new MailService(new LinkBuilder({ appPublicUrl: 'http://localhost:5173' }), dispatcher, { ttl });
  return { dispatcher, service, record };
}

const to = { usuarioId: new Types.ObjectId(), correo: 'ana@example.test', nombre: 'Ana <b>' };

// T-12 (CA-04, CA-06, CA-08, RN-04, RN-06, RN-08, RN-13).
describe('MailService y MailDispatcher (T-12)', () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    for (const method of ['log', 'error', 'warn'] as const) {
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
    }
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => (logs.push(String(chunk)), true));
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => (logs.push(String(chunk)), true));
  });
  afterEach(() => jest.restoreAllMocks());

  it('las 5 plantillas renderizan; las de enlace usan LinkBuilder y la vigencia de la configuración', () => {
    const link = new LinkBuilder({ appPublicUrl: 'http://localhost:5173' }).build('restablecerPassword', TOKEN);
    const reset = renderTemplate('RESTABLECIMIENTO', 'Ana', link, ttl.resetTokenMs);
    expect(reset.text).toContain(`http://localhost:5173/restablecer-contrasena#token=${TOKEN}`);
    expect(reset.text).toContain('30 minutos');
    expect(renderTemplate('VERIFICACION', 'Ana', 'x', ttl.verifyTokenMs).text).toContain('1 día');
    expect(renderTemplate('REENVIO_VERIFICACION', 'Ana', 'x').text).toContain('enlace anterior ya no sirve');
    expect(renderTemplate('ACTIVACION', 'Ana', 'x').subject).toContain('Activa');
    expect(renderTemplate('AVISO_CAMBIO_PASSWORD', 'Ana').text).not.toContain('#token=');
    expect(renderTemplate('VERIFICACION', '<script>', 'x').html).not.toContain('<script>');
    expect(describeDuration(86_400_000)).toBe('1 día');
  });

  it('envía después de responder (setImmediate) y el log no contiene el enlace ni el destinatario', async () => {
    const sender = new InMemoryMailSender();
    const { dispatcher, service } = setup(sender);
    expect(service.sendVerification(to, TOKEN)).toBe(true);
    expect(sender.sent).toHaveLength(0); // aún no: el envío ocurre tras la respuesta
    await dispatcher.drain();
    expect(sender.sent).toHaveLength(1);
    const message: MailMessage | undefined = sender.sent[0];
    if (!message) throw new Error('sin mensaje');
    expect(message.to).toBe('ana@example.test');
    expect(message.text).toContain(`/verificar-correo#token=${TOKEN}`);
    const joined = logs.join('\n');
    expect(joined).toContain('Correo enviado');
    expect(joined).not.toContain(TOKEN);
    expect(joined).not.toContain('ana@example.test');
  });

  it('un fallo SMTP se audita como CORREO_NO_ENVIADO sin enlace ni correo', async () => {
    const sender = new InMemoryMailSender();
    sender.failNext = 1;
    const { dispatcher, service, record } = setup(sender);
    service.sendPasswordReset(to, TOKEN);
    await dispatcher.drain();
    expect(record).toHaveBeenCalledWith({ evento: 'CORREO_NO_ENVIADO', resultado: 'RECHAZADO', usuarioId: to.usuarioId });
    expect(JSON.stringify(record.mock.calls)).not.toContain(TOKEN);
    expect(logs.join('\n')).not.toContain(TOKEN);
  });

  it('T-35: deliverActivation envía ahora y devuelve el resultado; un fallo SMTP → false y CORREO_NO_ENVIADO sin enlace', async () => {
    const sender = new InMemoryMailSender();
    const { service, record } = setup(sender);
    await expect(service.deliverActivation(to, TOKEN)).resolves.toBe(true);
    expect(sender.sent[0]?.text).toContain(`/activar-cuenta#token=${TOKEN}`);
    sender.failNext = 1;
    await expect(service.deliverActivation(to, TOKEN)).resolves.toBe(false);
    expect(record).toHaveBeenCalledWith({ evento: 'CORREO_NO_ENVIADO', resultado: 'RECHAZADO', usuarioId: to.usuarioId });
    expect(JSON.stringify(record.mock.calls)).not.toContain(TOKEN);
    expect(logs.join('\n')).not.toContain(TOKEN);
  });

  it('T-35: deliverActivation durante el apagado → false sin enviar', async () => {
    const sender = new InMemoryMailSender();
    const { dispatcher, service } = setup(sender);
    await dispatcher.drain();
    await expect(service.deliverActivation(to, TOKEN)).resolves.toBe(false);
    expect(sender.sent).toHaveLength(0);
  });

  it('SIGTERM con envíos pendientes → se drenan antes del cierre y luego no acepta más', async () => {
    let resolveSlow!: () => void;
    const slow: MailSender = { send: () => new Promise<void>((r) => (resolveSlow = r)) };
    const { dispatcher, service } = setup(slow);
    service.sendActivation(to, TOKEN);
    await new Promise((r) => setImmediate(r));
    expect(dispatcher.pendingCount).toBe(1);
    const draining = dispatcher.beforeApplicationShutdown();
    setTimeout(() => resolveSlow(), 20);
    await draining;
    expect(dispatcher.pendingCount).toBe(0);
    expect(service.sendPasswordChangedNotice(to)).toBe(false);
  });

  it('el drenaje respeta MAIL_DRAIN_TIMEOUT_MS si un envío no termina', async () => {
    const stuck: MailSender = { send: () => new Promise<void>(() => undefined) };
    const { dispatcher, service } = setup(stuck, 30);
    service.sendVerification(to, TOKEN, true);
    await new Promise((r) => setImmediate(r));
    await expect(dispatcher.drain()).resolves.toBe(1);
  });

  it('AUTH_MIN_RESPONSE_MS: la respuesta tarda al menos el mínimo, también si la operación falla', async () => {
    let started = performance.now();
    await withMinimumDuration(60, () => Promise.resolve('ok'));
    expect(performance.now() - started).toBeGreaterThanOrEqual(55);
    started = performance.now();
    await expect(withMinimumDuration(60, () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(performance.now() - started).toBeGreaterThanOrEqual(55);
  });
});
