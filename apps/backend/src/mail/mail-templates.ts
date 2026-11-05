/**
 * Plantillas de correo (T-12): verificación, reenvío, restablecimiento, activación y aviso de cambio.
 * Texto plano y HTML mínimo, sin recursos externos (plan §11). El nombre se escapa en HTML.
 */
export type MailTemplate = 'VERIFICACION' | 'REENVIO_VERIFICACION' | 'RESTABLECIMIENTO' | 'ACTIVACION' | 'AVISO_CAMBIO_PASSWORD';

export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Texto legible de una vigencia en milisegundos (p. ej. «24 horas», «30 minutos»). */
export function describeDuration(ms: number): string {
  const units: readonly [number, string, string][] = [
    [86_400_000, 'día', 'días'],
    [3_600_000, 'hora', 'horas'],
    [60_000, 'minuto', 'minutos'],
    [1_000, 'segundo', 'segundos'],
  ];
  for (const [size, singular, plural] of units) {
    if (ms >= size && ms % size === 0) {
      const n = ms / size;
      return `${n} ${n === 1 ? singular : plural}`;
    }
  }
  return `${Math.ceil(ms / 1_000)} segundos`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function render(subject: string, nombre: string, lines: readonly string[], link?: { label: string; href: string }): RenderedMail {
  const greeting = `Hola, ${nombre}:`;
  const text = [greeting, '', ...lines, ...(link ? ['', `${link.label}: ${link.href}`] : [])].join('\n');
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    ...(link ? [`<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>`] : []),
  ].join('\n');
  return { subject, text, html };
}

/** `vigencia`: duración del enlace leída de la configuración (RNF-04: sin literales en el código). */
export function renderTemplate(template: MailTemplate, nombre: string, link?: string, vigenciaMs?: number): RenderedMail {
  const vence = vigenciaMs ? ` y vence en ${describeDuration(vigenciaMs)}` : '';
  switch (template) {
    case 'VERIFICACION':
    case 'REENVIO_VERIFICACION':
      return render(
        'Confirma tu correo en OMR-PreICFES',
        nombre,
        [
          template === 'VERIFICACION'
            ? 'Recibimos una solicitud para crear una cuenta con este correo.'
            : 'Pediste un nuevo enlace para confirmar tu correo. El enlace anterior ya no sirve.',
          `Abre el enlace y pulsa «Confirmar mi correo». Es de un solo uso${vence}.`,
          'Si no fuiste tú, ignora este mensaje.',
        ],
        link ? { label: 'Confirmar mi correo', href: link } : undefined,
      );
    case 'RESTABLECIMIENTO':
      return render(
        'Restablece tu contraseña de OMR-PreICFES',
        nombre,
        [
          'Recibimos una solicitud para restablecer tu contraseña.',
          `El enlace es de un solo uso${vence}. Al usarlo se cerrarán tus sesiones abiertas.`,
          'Si no fuiste tú, ignora este mensaje: tu contraseña no cambia.',
        ],
        link ? { label: 'Crear una nueva contraseña', href: link } : undefined,
      );
    case 'ACTIVACION':
      return render(
        'Activa la cuenta de administración de OMR-PreICFES',
        nombre,
        [
          'Se inicializó la cuenta de administración de este despliegue con tu correo.',
          `Abre el enlace para definir tu contraseña. Es de un solo uso${vence}.`,
        ],
        link ? { label: 'Activar la cuenta', href: link } : undefined,
      );
    case 'AVISO_CAMBIO_PASSWORD':
      return render('Tu contraseña de OMR-PreICFES cambió', nombre, [
        'La contraseña de tu cuenta se cambió y se cerraron todas tus sesiones.',
        'Si no fuiste tú, pide restablecerla de nuevo y avisa a quien administra tu institución.',
      ]);
  }
}
