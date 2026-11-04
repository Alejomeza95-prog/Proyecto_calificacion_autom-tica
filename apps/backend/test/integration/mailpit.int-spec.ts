import { randomBytes } from 'node:crypto';
import { NodemailerSmtpMailSender } from '../../src/mail/mail-sender';

/**
 * T-21 (DEC-05): envío real por SMTP contra Mailpit, solo desarrollo y pruebas.
 *
 * Opcional: se ejecuta cuando la variable de prueba `MAILPIT_API_URL` apunta a la API de Mailpit
 * (p. ej. `http://127.0.0.1:8025`, tras `docker compose --profile mail-dev up -d mailpit`).
 * Sin ella la suite se omite de forma visible (aparece como `skipped`); el resto de pruebas usa
 * `InMemoryMailSender` y no depende de Mailpit.
 */
const API = process.env.MAILPIT_API_URL;
const SMTP_HOST = process.env.MAILPIT_SMTP_HOST ?? '127.0.0.1';
const SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT ?? '1025');

interface MailpitSearch {
  readonly messages: ReadonlyArray<{ readonly ID: string; readonly Subject: string; readonly To: ReadonlyArray<{ readonly Address: string }> }>;
}

async function searchBySubject(subject: string): Promise<MailpitSearch['messages']> {
  const res = await fetch(`${API}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
  expect(res.ok).toBe(true);
  const body = (await res.json()) as MailpitSearch;
  return body.messages;
}

(API ? describe : describe.skip)('Mailpit: correo visible en desarrollo (T-21, DEC-05)', () => {
  it('un correo enviado por el adaptador SMTP aparece en Mailpit', async () => {
    const sender = new NodemailerSmtpMailSender(
      { host: SMTP_HOST, port: SMTP_PORT, secure: false, user: undefined, password: undefined },
      'OMR PreICFES <no-reply@example.test>',
    );
    const subject = `Prueba T-21 ${randomBytes(6).toString('hex')}`;
    const link = 'http://localhost:5173/verificar-correo#token=prueba';

    await sender.send({ to: 'destino@example.test', subject, text: `Enlace: ${link}`, html: `<a href="${link}">Verificar</a>` });

    let found: MailpitSearch['messages'] = [];
    for (let i = 0; i < 20 && found.length === 0; i += 1) {
      found = await searchBySubject(subject);
      if (found.length === 0) await new Promise((r) => setTimeout(r, 100));
    }
    expect(found).toHaveLength(1);
    expect(found[0]?.To.map((t) => t.Address)).toEqual(['destino@example.test']);

    const raw = await fetch(`${API}/api/v1/message/${found[0]?.ID ?? ''}`);
    const message = (await raw.json()) as { Text: string };
    expect(message.Text).toContain('#token=prueba');

    await fetch(`${API}/api/v1/messages`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ IDs: [found[0]?.ID] }),
    });
  });
});
