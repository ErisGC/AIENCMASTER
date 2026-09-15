import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';
import type {
  EventConflictKind,
  EventScope,
  EventType,
  EventsQuery,
  PublicEvent,
} from './events';

/**
 * Cronograma, lado administrativo. Cubre listar, revisar cruces, crear (con
 * repetición), editar y eliminar, y la bandeja de avisos.
 */

export interface EventConflict {
  eventId: string;
  title: string;
  type: EventType;
  scope: EventScope;
  churchId: string | null;
  churchName: string | null;
  startsAt: string;
  endsAt: string;
  kind: EventConflictKind;
}

/** Cruces de una fecha concreta (en una repetición, cada fecha por su cuenta). */
export interface ConflictsForDate {
  startsAt: string;
  endsAt: string;
  conflicts: EventConflict[];
}

export type RepeatFrequency = 'WEEKLY' | 'MONTHLY_BY_WEEKDAY';

export interface AdminEvent extends PublicEvent {
  seriesId: string | null;
  seriesRule: RepeatFrequency | null;
  seriesLabel: string | null;
  createdByAdminAccountId: string;
  createdByDisplayName: string;
  lastUpdatedByAdminAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Si quien consulta puede editarlo o eliminarlo. */
  editable: boolean;
}

export interface EventAlerts {
  count: number;
  items: Array<{ event: PublicEvent; conflicts: EventConflict[] }>;
}

export interface CreateEventPayload {
  title: string;
  description?: string | null;
  type: EventType;
  scope: EventScope;
  churchId?: string | null;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  directorIds?: string[];
  repeat?: { frequency: RepeatFrequency; until: string } | null;
  acknowledgeConflicts?: boolean;
}

export type UpdateEventPayload = Partial<Omit<CreateEventPayload, 'repeat'>>;

export interface CheckEventPayload {
  scope: EventScope;
  churchId?: string | null;
  startsAt: string;
  endsAt: string;
  excludeId?: string | null;
  repeat?: { frequency: RepeatFrequency; until: string } | null;
}

/**
 * Error con los cruces adjuntos. El servidor responde 409 cuando el evento
 * choca con otros y no se reconoció el cruce; el formulario lo captura para
 * mostrarlos y ofrecer "guardar de todos modos".
 */
export class EventConflictError extends Error {
  readonly conflicts: ConflictsForDate[];
  constructor(message: string, conflicts: ConflictsForDate[]) {
    super(message);
    this.name = 'EventConflictError';
    this.conflicts = conflicts;
  }
}

async function eventsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body !== undefined && init.body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'No se pudo contactar el servidor. Revisa tu conexión e inténtalo de nuevo.',
    );
  }

  if (!res.ok) {
    // Sesión caducada a mitad de la navegación: se lleva al acceso en vez de
    // dejar el aviso pegado en pantalla hasta la siguiente navegación.
    if (res.status === 401) manejarSesionExpirada(path);
    const text = await res.text().catch(() => '');
    let body: { message?: string | string[]; conflicts?: ConflictsForDate[] } = {};
    try {
      body = text ? (JSON.parse(text) as typeof body) : {};
    } catch {
      /* cuerpo no legible */
    }
    if (typeof window !== 'undefined') {
      const log = res.status >= 500 ? console.error : console.debug;
      log('[admin-events]', init?.method ?? 'GET', path, res.status, text);
    }
    if (res.status === 409 && Array.isArray(body.conflicts)) {
      throw new EventConflictError(
        typeof body.message === 'string'
          ? body.message
          : 'El evento se cruza con otros ya programados.',
        body.conflicts,
      );
    }
    const delServidor =
      typeof body.message === 'string'
        ? body.message
        : Array.isArray(body.message)
          ? body.message[0]
          : null;
    const friendly =
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? (delServidor ?? 'No tienes permisos para esta acción.')
          : res.status === 404
            ? (delServidor ?? 'No se encontró el evento.')
            : res.status === 400
              ? (delServidor ?? 'Revisa los datos del evento.')
              : res.status >= 500
                ? 'Error del servidor. Intenta más tarde.'
                : (delServidor ?? 'No se pudo completar la solicitud.');
    throw new Error(friendly);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Respuesta inválida del servidor.');
  }
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

export function adminListEvents(q?: EventsQuery) {
  return eventsRequest<AdminEvent[]>(conQuery('/admin/events', q));
}

export function adminGetEvent(id: string) {
  return eventsRequest<AdminEvent>(`/admin/events/${id}`);
}

/** Nombre del aviso que la pantalla de eventos emite al refrescar los cruces,
 *  para que la insignia de la barra lateral se actualice sin recargar. */
export const EVENT_ALERTS_CHANGED = 'aienc:event-alerts';

export function adminGetEventAlerts() {
  return eventsRequest<EventAlerts>('/admin/events/alerts');
}

/** Revisa cruces sin guardar. Devuelve una entrada por fecha con cruces. */
export function adminCheckEvent(payload: CheckEventPayload) {
  return eventsRequest<ConflictsForDate[]>('/admin/events/check', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function adminCreateEvent(payload: CreateEventPayload) {
  return eventsRequest<{
    events: AdminEvent[];
    seriesId: string | null;
    conflicts: ConflictsForDate[];
  }>('/admin/events', { method: 'POST', body: JSON.stringify(payload) });
}

export function adminUpdateEvent(id: string, payload: UpdateEventPayload) {
  return eventsRequest<{ event: AdminEvent; conflicts: EventConflict[] }>(
    `/admin/events/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function adminDeleteEvent(id: string, wholeSeries = false) {
  return eventsRequest<{ deleted: boolean; count: number }>(
    `/admin/events/${id}${wholeSeries ? '?series=true' : ''}`,
    { method: 'DELETE' },
  );
}

/* ── Texto llano para cruces ────────────────────────────────────────────── */

export function describirCruce(c: EventConflict): string {
  const con = c.churchName
    ? `${c.title} (${c.churchName})`
    : `${c.title} (toda la Asociación)`;
  return c.kind === 'SE_CRUZA'
    ? `Queda encima de ${con}`
    : `Queda a menos de dos horas de ${con}`;
}
