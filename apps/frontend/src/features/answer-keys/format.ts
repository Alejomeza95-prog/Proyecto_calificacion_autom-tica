const dayFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' });

/** `YYYY-MM-DD` → fecha legible, sin desplazamiento por zona horaria. */
export function formatDay(fecha: string): string {
  return dayFormat.format(new Date(`${fecha}T00:00:00Z`));
}
