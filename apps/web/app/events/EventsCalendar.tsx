'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MonthCalendar } from '@/app/components/MonthCalendar';
import {
  EVENT_SCOPE_LABELS,
  EVENT_TYPE_LABELS,
  agruparPorDia,
  claveDia,
  formatDiaLargo,
  formatRango,
  getPublicEvents,
  type EventScope,
  type PublicEvent,
} from '@/app/lib/events';

import styles from './page.module.css';

interface Props {
  initialEvents: PublicEvent[];
  churches: Array<{ id: string; name: string }>;
  initialChurchId: string;
  today: string;
}

type FiltroAlcance = 'TODOS' | EventScope;

/** Ventana de consulta de un mes, con una semana de holgura a cada lado. */
function ventanaDe(year: number, month: number) {
  const desde = new Date(Date.UTC(year, month, 1));
  desde.setUTCDate(desde.getUTCDate() - 7);
  const hasta = new Date(Date.UTC(year, month + 1, 0));
  hasta.setUTCDate(hasta.getUTCDate() + 7);
  return { from: desde.toISOString().slice(0, 10), to: hasta.toISOString().slice(0, 10) };
}

export function EventsCalendar({ initialEvents, churches, initialChurchId, today }: Props) {
  const [anioHoy, mesHoy] = today.split('-').map(Number);
  const [year, setYear] = useState(anioHoy);
  const [month, setMonth] = useState(mesHoy - 1);
  const [events, setEvents] = useState<PublicEvent[]>(initialEvents);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [alcance, setAlcance] = useState<FiltroAlcance>('TODOS');
  const [churchId, setChurchId] = useState(initialChurchId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cargaVigente = useRef(0);

  // Recarga al cambiar de mes o de iglesia. Una respuesta tardía de una carga
  // anterior no debe pisar la actual: se compara contra el número de carga.
  const cargar = useCallback(async () => {
    const mia = ++cargaVigente.current;
    setLoading(true);
    try {
      const { from, to } = ventanaDe(year, month);
      const data = await getPublicEvents({ from, to, churchId: churchId || undefined });
      if (mia !== cargaVigente.current) return;
      setEvents(data);
      setError(null);
    } catch {
      if (mia !== cargaVigente.current) return;
      setError('No se pudo cargar el cronograma. Intenta de nuevo en un momento.');
    } finally {
      if (mia === cargaVigente.current) setLoading(false);
    }
  }, [year, month, churchId]);

  const primeraCarga = useRef(true);
  useEffect(() => {
    // La primera vez ya venimos con datos del servidor.
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(
    () => (alcance === 'TODOS' ? events : events.filter((e) => e.scope === alcance)),
    [events, alcance],
  );

  // Agenda: el día seleccionado, o los próximos eventos si no hay selección.
  const agenda = useMemo(() => {
    const ordenados = [...filtrados].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (selectedDay) return ordenados.filter((e) => claveDia(e.startsAt) === selectedDay);
    return ordenados.filter((e) => claveDia(e.startsAt) >= today).slice(0, 12);
  }, [filtrados, selectedDay, today]);
  const agendaPorDia = useMemo(() => agruparPorDia(agenda), [agenda]);

  function irA(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
    setSelectedDay(null);
  }

  function irAHoy() {
    setYear(anioHoy);
    setMonth(mesHoy - 1);
    setSelectedDay(today);
  }

  return (
    <div className={styles.layout}>
      <div className={styles.filters} role="group" aria-label="Filtros">
        <div className={styles.segmented}>
          {(
            [
              ['TODOS', 'Todos'],
              ['GLOBAL', 'Toda la Asociación'],
              ['LOCAL', 'Solo iglesias'],
            ] as Array<[FiltroAlcance, string]>
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              className={alcance === valor ? styles.segActive : ''}
              onClick={() => setAlcance(valor)}
              aria-pressed={alcance === valor}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <label className={styles.churchFilter}>
          <span>Iglesia</span>
          <select value={churchId} onChange={(e) => setChurchId(e.target.value)}>
            <option value="">Todas las iglesias</option>
            {churches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {loading && <span className={styles.loading}>Actualizando…</span>}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.columns}>
        <MonthCalendar
          year={year}
          month={month}
          events={filtrados}
          selectedDay={selectedDay}
          onSelectDay={(k) => setSelectedDay((prev) => (prev === k ? null : k))}
          onPrev={() => irA(-1)}
          onNext={() => irA(1)}
          onToday={irAHoy}
          today={today}
        />

        <aside className={styles.agenda} aria-live="polite">
          <header className={styles.agendaHead}>
            <h2 className={styles.agendaTitle}>
              {selectedDay ? formatDiaLargo(`${selectedDay}T12:00:00-05:00`) : 'Próximos eventos'}
            </h2>
            {selectedDay && (
              <button type="button" className={styles.linkBtn} onClick={() => setSelectedDay(null)}>
                Ver próximos
              </button>
            )}
          </header>

          {agenda.length === 0 ? (
            <p className={styles.empty}>
              {selectedDay
                ? 'No hay eventos programados ese día.'
                : 'No hay eventos programados por ahora.'}
            </p>
          ) : (
            Array.from(agendaPorDia.entries()).map(([dia, lista]) => (
              <section key={dia} className={styles.agendaDay}>
                {!selectedDay && (
                  <h3 className={styles.agendaDayTitle}>
                    {formatDiaLargo(`${dia}T12:00:00-05:00`)}
                  </h3>
                )}
                <ul className={styles.agendaList}>
                  {lista.map((e) => (
                    <li
                      key={e.id}
                      className={`${styles.eventCard} ${e.scope === 'GLOBAL' ? styles.eventGlobal : styles.eventLocal}`}
                    >
                      <span className={styles.eventWhen}>{formatRango(e.startsAt, e.endsAt)}</span>
                      <h4 className={styles.eventTitle}>{e.title}</h4>
                      <p className={styles.eventMeta}>
                        <span className={styles.eventType}>{EVENT_TYPE_LABELS[e.type]}</span>
                        {' · '}
                        {e.scope === 'GLOBAL'
                          ? e.churchName
                            ? `${EVENT_SCOPE_LABELS.GLOBAL} · organiza ${e.churchName}`
                            : EVENT_SCOPE_LABELS.GLOBAL
                          : (e.churchName ?? EVENT_SCOPE_LABELS.LOCAL)}
                      </p>
                      {e.location && <p className={styles.eventPlace}>📍 {e.location}</p>}
                      {e.directors.length > 0 && (
                        <p className={styles.eventDirectors}>
                          {e.directors.length === 1 ? 'Encargado: ' : 'Encargados: '}
                          {e.directors.map((d) => d.displayName).join(', ')}
                        </p>
                      )}
                      {e.description && <p className={styles.eventDesc}>{e.description}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
