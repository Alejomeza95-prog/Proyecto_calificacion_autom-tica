/** Lectura de los correos de prueba en Mailpit (plan §12). Los tokens solo pasan por la prueba; nunca se imprimen. */
const MAILPIT_API = 'http://127.0.0.1:8025/api/v1';
const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 15_000;

interface MailpitSearch {
  readonly messages: readonly { readonly ID: string }[];
}

interface MailpitMessage {
  readonly Text: string;
}

async function searchByRecipient(correo: string): Promise<MailpitSearch['messages']> {
  const query = encodeURIComponent(`to:"${correo}"`);
  const response = await fetch(`${MAILPIT_API}/search?query=${query}`);
  if (!response.ok) throw new Error(`Mailpit respondió ${response.status}`);
  return ((await response.json()) as MailpitSearch).messages;
}

/**
 * Enlace del correo más reciente, cuando ya hay `expectedCount` mensajes para ese destinatario.
 * El envío es asíncrono, así que espera a que llegue.
 */
export async function readLink(correo: string, path: string, expectedCount = 1): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const messages = await searchByRecipient(correo);
    const newest = messages[0];
    if (newest && messages.length >= expectedCount) {
      const detail = await fetch(`${MAILPIT_API}/message/${newest.ID}`);
      const { Text } = (await detail.json()) as MailpitMessage;
      const link = new RegExp(`https?://[^\\s"<>]+${path}#token=[^\\s"<>]+`).exec(Text)?.[0];
      if (!link) throw new Error(`El correo no contiene un enlace a ${path}`);
      return link;
    }
    await new Promise((done) => setTimeout(done, POLL_INTERVAL_MS));
  }
  throw new Error(`No llegaron ${expectedCount} correos a Mailpit a tiempo`);
}

export async function countMessages(correo: string): Promise<number> {
  return (await searchByRecipient(correo)).length;
}
