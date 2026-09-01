/**
 * Fecha de calendario, sin hora, leída en UTC.
 *
 * Para períodos de informe y otras fechas que representan un DÍA y no un
 * instante. Se guardan como la medianoche UTC de ese día, así que leerlas con
 * los getters locales las corre a la víspera en cualquier huso al oeste de
 * Greenwich (Colombia incluida).
 */
export function formatCalendarDate(date: string | Date): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = d.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date);

  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();

  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');

  return `${day}/${month}/${year} · ${hours}:${minutes}`;
}

const dateTimeWithSecondsFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'America/Bogota',
});

export function formatDateTimeWithSeconds(date: string | Date): string {
  return dateTimeWithSecondsFormatter.format(new Date(date));
}
