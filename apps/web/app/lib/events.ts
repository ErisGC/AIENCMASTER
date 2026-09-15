import { API_BASE_URL } from './api';

/**
 * Cronograma público. Tipos, etiquetas en español y utilidades de fecha en
 * hora de Colombia. La parte administrativa vive en `admin-events.ts`.
 */

export type EventType =
  | 'CULTO'
  | 'CULTO_UNIDO'
  | 'CULTO_JOVENES'
  | 'CULTO_DAMAS'
  | 'CULTO_CABALLEROS'
  | 'REUNION'
  | 'ASAMBLEA'
  | 'ESTUDIO'
  | 'INTENSIVO'
  | 'OTRO';

export type EventScope = 'LOCAL' | 'GLOBAL';

export type EventConflictKind = 'SE_CRUZA' | 'MUY_CERCA';

export interface EventDirector {
  id: string;
  churchId: string;
  displayName: string;
  role: string;
  photoUrl: string | null;
}

export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  type: EventType;
  scope: EventScope;
  churchId: string | null;
  churchName: string | null;
  startsAt: string;
  endsAt: string;
  location: string | null;
  directors: EventDirector[];
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  CULTO: 'Culto',
  CULTO_UNIDO: 'Culto unido',
  CULTO_JOVENES: 'Culto de jóvenes',
  CULTO_DAMAS: 'Culto de damas',
  CULTO_CABALLEROS: 'Culto de caballeros',
  REUNION: 'Reunión',
  ASAMBLEA: 'Asamblea',
  ESTUDIO: 'Reunión de estudio',
  INTENSIVO: 'Intensivo',
  OTRO: 'Otro',
};

export const EVENT_TYPES: EventType[] = [
  'CULTO',
  'CULTO_UNIDO',
  'CULTO_JOVENES',
  'CULTO_DAMAS',
  'CULTO_CABALLEROS',
  'REUNION',
  'ASAMBLEA',
  'ESTUDIO',
  'INTENSIVO',
  'OTRO',
];

/** Tipos que, por su naturaleza, suelen ser de toda la Asociación. */
export const TIPOS_NORMALMENTE_GLOBALES: EventType[] = [
  'CULTO_UNIDO',
  'ASAMBLEA',
  'ESTUDIO',
  'INTENSIVO',
];

export const EVENT_SCOPE_LABELS: Record<EventScope, string> = {
  LOCAL: 'De la iglesia',
  GLOBAL: 'De toda la Asociación',
};

/* ── Fechas en hora de Colombia ─────────────────────────────────────────── */

export const ZONA = 'America/Bogota';

const fmtDiaCorto = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: ZONA,
});
const fmtDiaLargo = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: ZONA,
});
const fmtHora = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: ZONA,
});
const fmtMes = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
  timeZone: ZONA,
});

export function formatDiaCorto(iso: string | Date) {
  return fmtDiaCorto.format(new Date(iso));
}
export function formatDiaLargo(iso: string | Date) {
  const s = fmtDiaLargo.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function formatHora(iso: string | Date) {
  return fmtHora.format(new Date(iso)).replace(/\s?([ap])\.\s?m\./i, ' $1. m.');
}
export function formatMes(d: Date) {
  const s = fmtMes.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Rango legible: "7:00 p. m. a 9:00 p. m." o con fechas si cruza de día. */
export function formatRango(startsAt: string, endsAt: string) {
  const mismoDia = claveDia(startsAt) === claveDia(endsAt);
  if (mismoDia) return `${formatHora(startsAt)} a ${formatHora(endsAt)}`;
  return `${formatDiaCorto(startsAt)} ${formatHora(startsAt)} a ${formatDiaCorto(endsAt)} ${formatHora(endsAt)}`;
}

/**
 * Clave "AAAA-MM-DD" del día en Colombia. Sirve para agrupar eventos por día
 * y para pintar el calendario sin que la zona horaria del navegador (o del
 * servidor al renderizar) cambie de día un culto de las 7 de la noche.
 */
export function claveDia(iso: string | Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: ZONA,
  }).formatToParts(new Date(iso));
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return `${p('year')}-${p('month')}-${p('day')}`;
}

export function agruparPorDia<T extends { startsAt: string }>(
  items: T[],
): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const it of items) {
    const k = claveDia(it.startsAt);
    const lista = mapa.get(k) ?? [];
    lista.push(it);
    mapa.set(k, lista);
  }
  return mapa;
}

/* ── Consultas públicas ─────────────────────────────────────────────────── */

export interface EventsQuery {
  from?: string;
  to?: string;
  churchId?: string;
  scope?: EventScope;
}

function conQuery(path: string, q?: EventsQuery) {
  const sp = new URLSearchParams();
  if (q?.from) sp.set('from', q.from);
  if (q?.to) sp.set('to', q.to);
  if (q?.churchId) sp.set('churchId', q.churchId);
  if (q?.scope) sp.set('scope', q.scope);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

/** Cronograma general. Sin rango: los próximos 60 días. */
export function getPublicEvents(q?: EventsQuery) {
  return publicGet<PublicEvent[]>(conQuery('/events', q));
}

/** Lo que ve una iglesia: sus eventos y los de toda la Asociación. */
export function getPublicChurchEvents(churchId: string, q?: EventsQuery) {
  return publicGet<PublicEvent[]>(conQuery(`/churches/${churchId}/events`, q));
}
