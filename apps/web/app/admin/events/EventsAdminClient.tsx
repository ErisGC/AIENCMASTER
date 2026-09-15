'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MonthCalendar } from '@/app/components/MonthCalendar';
import { useActiveChurch } from '@/app/admin/_components/ActiveChurchContext';
import { adminGetSession } from '@/app/lib/admin-auth';
import { adminGetChurches, type Church } from '@/app/lib/admin-churches';
import {
  adminDeleteEvent,
  adminGetEventAlerts,
  adminListEvents,
  describirCruce,
  type AdminEvent,
  type EventAlerts,
} from '@/app/lib/admin-events';
import {
  EVENT_SCOPE_LABELS,
  EVENT_TYPE_LABELS,
  agruparPorDia,
  claveDia,
  formatDiaLargo,
  formatRango,
  type EventScope,
} from '@/app/lib/events';

import { EventForm } from './EventForm';
import styles from './page.module.css';

type FiltroAlcance = 'TODOS' | EventScope;

function ventanaDe(year: number, month: number) {
  const desde = new Date(Date.UTC(year, month, 1));
  desde.setUTCDate(desde.getUTCDate() - 7);
  const hasta = new Date(Date.UTC(year, month + 1, 0));
  hasta.setUTCDate(hasta.getUTCDate() + 7);
  return {
    from: desde.toISOString().slice(0, 10),
    to: hasta.toISOString().slice(0, 10),
  };
}

/**
 * Cronograma en el panel. Misma cuadrícula que el portal público, más:
 * crear, editar y eliminar (según permisos), y la bandeja de avisos con los
 * eventos que hoy tienen cruces de horario.
 */
export function EventsAdminClient() {
  const { isRoot, assignments, activeChurchId, isLoaded } = useActiveChurch();

  const today = useMemo(() => claveDia(new Date()), []);
  const [anioHoy, mesHoy] = today.split('-').map(Number);
  const [year, setYear] = useState(anioHoy);
  const [month, setMonth] = useState(mesHoy - 1);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [alcance, setAlcance] = useState<FiltroAlcance>('TODOS');

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [alerts, setAlerts] = useState<EventAlerts | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [canGlobal, setCanGlobal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState<{ mode: 'create' | 'edit'; event?: AdminEvent } | null>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);

  const cargaVigente = useRef(0);

  function avisar(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Quién soy y qué puedo: iglesias visibles y si gestiono eventos globales.
  useEffect(() => {
    let mounted = true;
    void Promise.all([adminGetSession(), adminGetChurches().catch(() => [] as Church[])]).then(
      ([session, lista]) => {
        if (!mounted) return;
        const globales = session.account?.globalPermissions ?? [];
        setCanGlobal(session.account?.role === 'ROOT' || globales.includes('MANAGE_GLOBAL_EVENTS'));
        setChurches(lista);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const cargarEventos = useCallback(async () => {
    const mia = ++cargaVigente.current;
    setLoading(true);
    try {
      const { from, to } = ventanaDe(year, month);
      const data = await adminListEvents({ from, to });
      if (mia !== cargaVigente.current) return;
      setEvents(data);
      setError(null);
    } catch (e) {
      if (mia !== cargaVigente.current) return;
      setError(e instanceof Error ? e.message : 'No se pudo cargar el cronograma.');
    } finally {
      if (mia === cargaVigente.current) setLoading(false);
    }
  }, [year, month]);

  const cargarAvisos = useCallback(async () => {
    try {
      setAlerts(await adminGetEventAlerts());
    } catch {
      /* la bandeja no debe estorbar si falla */
    }
  }, []);

  useEffect(() => {
    void cargarEventos();
  }, [cargarEventos]);

  useEffect(() => {
    void cargarAvisos();
  }, [cargarAvisos]);

  const conflictIds = useMemo(() => {
    const s = new Set<string>();
    for (const it of alerts?.items ?? []) s.add(it.event.id);
    return s;
  }, [alerts]);

  const filtrados = useMemo(
    () => (alcance === 'TODOS' ? events : events.filter((e) => e.scope === alcance)),
    [events, alcance],
  );

  const agenda = useMemo(() => {
    const ordenados = [...filtrados].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (selectedDay) return ordenados.filter((e) => claveDia(e.startsAt) === selectedDay);
    return ordenados.filter((e) => claveDia(e.startsAt) >= today).slice(0, 15);
  }, [filtrados, selectedDay, today]);
  const agendaPorDia = useMemo(() => agruparPorDia(agenda), [agenda]);

  // Iglesias sobre las que este admin puede programar eventos.
  const iglesiasGestionables = useMemo(() => {
    if (isRoot) return churches.map((c) => ({ id: c.id, name: c.name }));
    return assignments
      .filter((a) => a.permissions.includes('MANAGE_EVENTS'))
      .map((a) => ({ id: a.churchId, name: a.churchName ?? 'Iglesia' }));
  }, [isRoot, churches, assignments]);

  const puedeCrear = iglesiasGestionables.length > 0 || canGlobal;

  function irA(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setYear(d.getUTCFullYear());
    setMonth(d.getUTCMonth());
    setSelectedDay(null);
  }

  async function confirmarEliminar(todaLaSerie: boolean) {
    if (!deleting) return;
    const objetivo = deleting;
    setDeleting(null);
    try {
      const out = await adminDeleteEvent(objetivo.id, todaLaSerie);
      avisar(
        out.count > 1
          ? `Se eliminaron ${out.count} fechas de "${objetivo.title}".`
          : `Se eliminó "${objetivo.title}".`,
      );
      await Promise.all([cargarEventos(), cargarAvisos()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el evento.');
    }
  }

  async function alGuardar(mensaje: string) {
    setForm(null);
    avisar(mensaje);
    await Promise.all([cargarEventos(), cargarAvisos()]);
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>Cronograma</h1>
          <p className={styles.subtitle}>
            Cultos, reuniones y actividades de las iglesias y de toda la Asociación.
            El sistema avisa cuando dos eventos se cruzan.
          </p>
        </div>
        {puedeCrear && (
          <button type="button" className={styles.primaryBtn} onClick={() => setForm({ mode: 'create' })}>
            + Nuevo evento
          </button>
        )}
      </header>

      {toast && <div className={styles.toast} role="status">{toast}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}

      {alerts && alerts.count > 0 && (
        <section className={styles.alerts} aria-label="Avisos de cruces">
          <h2 className={styles.alertsTitle}>
            {alerts.count === 1
              ? 'Hay 1 evento con cruce de horario'
              : `Hay ${alerts.count} eventos con cruce de horario`}
          </h2>
          <ul className={styles.alertsList}>
            {alerts.items.map(({ event, conflicts }) => (
              <li key={event.id} className={styles.alertItem}>
                <div className={styles.alertMain}>
                  <strong>{event.title}</strong>
                  <span className={styles.alertWhen}>
                    {formatDiaLargo(event.startsAt)} · {formatRango(event.startsAt, event.endsAt)}
                    {event.churchName ? ` · ${event.churchName}` : ' · Toda la Asociación'}
                  </span>
                  <ul className={styles.alertReasons}>
                    {conflicts.map((c) => (
                      <li key={c.eventId}>{describirCruce(c)}</li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => {
                    const k = claveDia(event.startsAt);
                    const [y, m] = k.split('-').map(Number);
                    setYear(y);
                    setMonth(m - 1);
                    setSelectedDay(k);
                  }}
                >
                  Ver en el calendario
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.filters}>
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
              aria-pressed={alcance === valor}
              onClick={() => setAlcance(valor)}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        {loading && <span className={styles.loading}>Cargando…</span>}
      </div>

      <div className={styles.columns}>
        <MonthCalendar
          year={year}
          month={month}
          events={filtrados}
          selectedDay={selectedDay}
          onSelectDay={(k) => setSelectedDay((prev) => (prev === k ? null : k))}
          onPrev={() => irA(-1)}
          onNext={() => irA(1)}
          onToday={() => {
            setYear(anioHoy);
            setMonth(mesHoy - 1);
            setSelectedDay(today);
          }}
          today={today}
          conflictIds={conflictIds}
          onEventClick={(e) => {
            const ev = events.find((x) => x.id === e.id);
            if (ev?.editable) setForm({ mode: 'edit', event: ev });
            else setSelectedDay(claveDia(e.startsAt));
          }}
        />

        <aside className={styles.agenda}>
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
              {selectedDay ? 'No hay eventos ese día.' : 'No hay eventos próximos.'}
              {puedeCrear && selectedDay && (
                <>
                  {' '}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setForm({ mode: 'create' })}
                  >
                    Programar uno
                  </button>
                </>
              )}
            </p>
          ) : (
            Array.from(agendaPorDia.entries()).map(([dia, lista]) => (
              <section key={dia} className={styles.agendaDay}>
                {!selectedDay && (
                  <h3 className={styles.agendaDayTitle}>{formatDiaLargo(`${dia}T12:00:00-05:00`)}</h3>
                )}
                <ul className={styles.agendaList}>
                  {lista.map((e) => (
                    <li
                      key={e.id}
                      className={[
                        styles.eventCard,
                        e.scope === 'GLOBAL' ? styles.eventGlobal : styles.eventLocal,
                        conflictIds.has(e.id) ? styles.eventConflict : '',
                      ].join(' ')}
                    >
                      <span className={styles.eventWhen}>{formatRango(e.startsAt, e.endsAt)}</span>
                      <h4 className={styles.eventTitle}>{e.title}</h4>
                      <p className={styles.eventMeta}>
                        {EVENT_TYPE_LABELS[e.type]} ·{' '}
                        {e.scope === 'GLOBAL'
                          ? EVENT_SCOPE_LABELS.GLOBAL + (e.churchName ? ` · organiza ${e.churchName}` : '')
                          : (e.churchName ?? EVENT_SCOPE_LABELS.LOCAL)}
                        {e.seriesLabel ? ` · se repite ${e.seriesLabel}` : ''}
                      </p>
                      {e.location && <p className={styles.eventMeta}>📍 {e.location}</p>}
                      {e.directors.length > 0 && (
                        <p className={styles.eventMeta}>
                          {e.directors.length === 1 ? 'Encargado: ' : 'Encargados: '}
                          {e.directors.map((d) => d.displayName).join(', ')}
                        </p>
                      )}
                      {conflictIds.has(e.id) && (
                        <p className={styles.eventWarn}>Este evento se cruza con otro. Revisa los avisos.</p>
                      )}
                      {e.editable && (
                        <div className={styles.eventActions}>
                          <button type="button" className={styles.ghostBtn} onClick={() => setForm({ mode: 'edit', event: e })}>
                            Editar
                          </button>
                          <button type="button" className={styles.dangerBtn} onClick={() => setDeleting(e)}>
                            Eliminar
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </aside>
      </div>

      {form && isLoaded && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={form.mode === 'create' ? 'Nuevo evento' : 'Editar evento'}>
          <div className={styles.modal}>
            <EventForm
              mode={form.mode}
              initial={form.event}
              churches={iglesiasGestionables}
              allChurches={churches.map((c) => ({ id: c.id, name: c.name }))}
              canGlobal={canGlobal}
              defaultChurchId={activeChurchId ?? iglesiasGestionables[0]?.id ?? ''}
              defaultDay={selectedDay}
              onCancel={() => setForm(null)}
              onSaved={alGuardar}
            />
          </div>
        </div>
      )}

      {deleting && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Eliminar evento">
          <div className={`${styles.modal} ${styles.modalSmall}`}>
            <h2 className={styles.modalTitle}>Eliminar “{deleting.title}”</h2>
            <p className={styles.modalText}>
              {formatDiaLargo(deleting.startsAt)} · {formatRango(deleting.startsAt, deleting.endsAt)}
            </p>
            {deleting.seriesId ? (
              <>
                <p className={styles.modalText}>
                  Este evento hace parte de una serie que se repite {deleting.seriesLabel ?? ''}. ¿Qué quieres eliminar?
                </p>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.ghostBtn} onClick={() => setDeleting(null)}>Cancelar</button>
                  <button type="button" className={styles.secondaryBtn} onClick={() => void confirmarEliminar(false)}>
                    Solo esta fecha
                  </button>
                  <button type="button" className={styles.dangerBtn} onClick={() => void confirmarEliminar(true)}>
                    Toda la serie
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.modalActions}>
                <button type="button" className={styles.ghostBtn} onClick={() => setDeleting(null)}>Cancelar</button>
                <button type="button" className={styles.dangerBtn} onClick={() => void confirmarEliminar(false)}>
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
