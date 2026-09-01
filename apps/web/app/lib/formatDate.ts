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

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Bogota',
});

/**
 * Fecha y hora en la zona horaria de Colombia.
 *
 * Se fija la zona a propósito. Con los getters locales, el servidor (que corre
 * en UTC) generaba un texto al renderizar y el navegador otro al hidratar:
 * además del aviso de React, la hora mostrada cambiaba sola al cargar la
 * página. Su gemela `formatDateTimeWithSeconds` ya fijaba la zona; esta no.
 */
export function formatDateTime(date: string | Date): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  // El separador se arma a mano para conservar el formato "dd/mm/aaaa · hh:mm".
  const partes = dateTimeFormatter.formatToParts(d);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? '';

  return `${parte('day')}/${parte('month')}/${parte('year')} · ${parte('hour')}:${parte('minute')}`;
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
