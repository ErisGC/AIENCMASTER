'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  EventConflictError,
  adminCheckEvent,
  adminCreateEvent,
  adminUpdateEvent,
  describirCruce,
  type AdminEvent,
  type ConflictsForDate,
  type CreateEventPayload,
  type RepeatFrequency,
} from '@/app/lib/admin-events';
import { adminListDirectors, type AdminDirector } from '@/app/lib/directors';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  TIPOS_NORMALMENTE_GLOBALES,
  formatDiaLargo,
  formatRango,
  type EventScope,
  type EventType,
} from '@/app/lib/events';

import styles from './page.module.css';

interface Opcion {
  id: string;
  name: string;
}

interface Props {
  mode: 'create' | 'edit';
  initial?: AdminEvent;
  /** Iglesias donde este admin puede programar eventos locales. */
  churches: Opcion[];
  /** Todas las iglesias (para elegir organizadora y encargados de globales). */
  allChurches: Opcion[];
  canGlobal: boolean;
  defaultChurchId: string;
  defaultDay: string | null;
  onCancel: () => void;
  onSaved: (mensaje: string) => void | Promise<void>;
}

/* ── Fechas: los campos del formulario están en la hora del navegador ── */

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function aCampos(iso: string) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function aIso(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "el primer jueves de cada mes", calculado a partir de la fecha elegida. */
function describirMensual(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return 'el mismo día de la semana cada mes';
  const dt = new Date(Date.UTC(y, m - 1, d));
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ordinal = Math.ceil(d / 7);
  const ultimo = d + 7 > total;
  const pos = ultimo ? 'último' : ['primer', 'segundo', 'tercer', 'cuarto', 'quinto'][ordinal - 1];
  return `el ${pos} ${NOMBRES_DIA[dt.getUTCDay()]} de cada mes`;
}

function describirSemanal(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return 'cada semana';
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `todos los ${NOMBRES_DIA[dt.getUTCDay()]}`;
}

function finDeAnio(date: string) {
  const y = Number(date.split('-')[0]) || new Date().getFullYear();
  return `${y}-12-31`;
}

export function EventForm({
  mode,
  initial,
  churches,
  allChurches,
  canGlobal,
  defaultChurchId,
  defaultDay,
  onCancel,
  onSaved,
}: Props) {
  const inicial = initial ? aCampos(initial.startsAt) : null;
  const finalInicial = initial ? aCampos(initial.endsAt) : null;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<EventType>(initial?.type ?? 'CULTO');
  const [scope, setScope] = useState<EventScope>(initial?.scope ?? 'LOCAL');
  const [churchId, setChurchId] = useState(initial?.churchId ?? defaultChurchId);
  const [date, setDate] = useState(inicial?.date ?? defaultDay ?? '');
  const [startTime, setStartTime] = useState(inicial?.time ?? '19:00');
  const [endTime, setEndTime] = useState(finalInicial?.time ?? '21:00');
  const [otroDia, setOtroDia] = useState(
    Boolean(inicial && finalInicial && inicial.date !== finalInicial.date),
  );
  const [endDate, setEndDate] = useState(finalInicial?.date ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const [repeat, setRepeat] = useState<'' | RepeatFrequency>('');
  const [until, setUntil] = useState('');

  // Encargados: los seleccionados, y el catálogo de la iglesia que se esté
  // consultando (para globales, se puede ir cambiando de iglesia).
  const [seleccionados, setSeleccionados] = useState<Map<string, { id: string; nombre: string; iglesia: string }>>(
    () => new Map((initial?.directors ?? []).map((d) => [d.id, { id: d.id, nombre: d.displayName, iglesia: '' }])),
  );
  const [iglesiaEncargados, setIglesiaEncargados] = useState(initial?.churchId ?? defaultChurchId);
  const [catalogo, setCatalogo] = useState<AdminDirector[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);

  const [cruces, setCruces] = useState<ConflictsForDate[] | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al elegir un tipo que suele ser de toda la Asociación, se sugiere el
  // alcance global (si la persona puede), sin imponerlo.
  useEffect(() => {
    if (mode !== 'create') return;
    if (TIPOS_NORMALMENTE_GLOBALES.includes(type) && canGlobal) setScope('GLOBAL');
  }, [type, canGlobal, mode]);

  // Para un evento local, los encargados salen de su iglesia.
  useEffect(() => {
    if (scope === 'LOCAL') setIglesiaEncargados(churchId);
  }, [scope, churchId]);

  useEffect(() => {
    if (!iglesiaEncargados) {
      setCatalogo([]);
      return;
    }
    let mounted = true;
    setCargandoCatalogo(true);
    adminListDirectors(iglesiaEncargados)
      .then((lista) => {
        if (mounted) setCatalogo(lista);
      })
      .catch(() => {
        if (mounted) setCatalogo([]);
      })
      .finally(() => {
        if (mounted) setCargandoCatalogo(false);
      });
    return () => {
      mounted = false;
    };
  }, [iglesiaEncargados]);

  const nombreIglesia = (id: string) => allChurches.find((c) => c.id === id)?.name ?? '';

  function alternarEncargado(d: AdminDirector) {
    setSeleccionados((prev) => {
      const next = new Map(prev);
      if (next.has(d.id)) next.delete(d.id);
      else next.set(d.id, { id: d.id, nombre: d.displayName, iglesia: nombreIglesia(d.churchId) });
      return next;
    });
  }

  const fechaFinEfectiva = otroDia && endDate ? endDate : date;

  const payloadBase = useMemo(() => {
    if (!date || !startTime || !endTime) return null;
    return {
      scope,
      churchId: churchId || null,
      startsAt: aIso(date, startTime),
      endsAt: aIso(fechaFinEfectiva, endTime),
    };
  }, [date, startTime, endTime, fechaFinEfectiva, scope, churchId]);

  const repeatPayload =
    mode === 'create' && repeat && until
      ? { frequency: repeat, until: `${until}T12:00:00-05:00` }
      : null;

  function validar(): string | null {
    if (!title.trim()) return 'Escribe el nombre del evento.';
    if (!date) return 'Elige la fecha.';
    if (!startTime || !endTime) return 'Indica la hora de inicio y de fin.';
    if (scope === 'LOCAL' && !churchId) return 'Elige la iglesia del evento.';
    if (scope === 'GLOBAL' && !canGlobal) return 'No tienes permiso para programar eventos de toda la Asociación.';
    if (payloadBase && new Date(payloadBase.endsAt) <= new Date(payloadBase.startsAt)) {
      return 'La hora de fin debe ser posterior a la de inicio.';
    }
    if (repeat && !until) return 'Indica hasta qué fecha se repite.';
    return null;
  }

  async function revisarCruces() {
    const problema = validar();
    if (problema || !payloadBase) {
      setError(problema);
      return;
    }
    setRevisando(true);
    setError(null);
    try {
      const out = await adminCheckEvent({
        ...payloadBase,
        excludeId: initial?.id ?? null,
        repeat: repeatPayload,
      });
      setCruces(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron revisar los cruces.');
    } finally {
      setRevisando(false);
    }
  }

  async function guardar(reconocerCruces: boolean) {
    const problema = validar();
    if (problema || !payloadBase) {
      setError(problema);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const comun: CreateEventPayload = {
        title: title.trim(),
        description: description.trim() || null,
        type,
        ...payloadBase,
        location: location.trim() || null,
        directorIds: Array.from(seleccionados.keys()),
        acknowledgeConflicts: reconocerCruces,
      };
      if (mode === 'create') {
        const out = await adminCreateEvent({ ...comun, repeat: repeatPayload });
        await onSaved(
          out.events.length > 1
            ? `Se programaron ${out.events.length} fechas de "${comun.title}".`
            : `Se programó "${comun.title}".`,
        );
      } else if (initial) {
        await adminUpdateEvent(initial.id, comun);
        await onSaved(`Se guardaron los cambios de "${comun.title}".`);
      }
    } catch (e) {
      if (e instanceof EventConflictError) {
        setCruces(e.conflicts);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo guardar el evento.');
      }
    } finally {
      setGuardando(false);
    }
  }

  const hayCruces = (cruces?.length ?? 0) > 0;
  const iglesiasParaLocal = churches;
  const iglesiasParaGlobal = allChurches;

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void guardar(false);
      }}
    >
      <header className={styles.formHead}>
        <h2 className={styles.modalTitle}>{mode === 'create' ? 'Nuevo evento' : 'Editar evento'}</h2>
        <button type="button" className={styles.closeBtn} onClick={onCancel} aria-label="Cerrar">
          ×
        </button>
      </header>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.field}>
        <label htmlFor="ev-title">Nombre del evento</label>
        <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Ej. Culto de jóvenes" required />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="ev-type">Tipo</label>
          <select id="ev-type" value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <fieldset className={styles.fieldsetScope}>
          <legend>¿A quién compete?</legend>
          <label className={styles.radio}>
            <input type="radio" name="scope" checked={scope === 'LOCAL'} onChange={() => setScope('LOCAL')} disabled={churches.length === 0} />
            <span>
              <strong>Solo a una iglesia</strong>
              <small>Avisa si se cruza con un evento de toda la Asociación.</small>
            </span>
          </label>
          <label className={styles.radio}>
            <input type="radio" name="scope" checked={scope === 'GLOBAL'} onChange={() => setScope('GLOBAL')} disabled={!canGlobal} />
            <span>
              <strong>A toda la Asociación</strong>
              <small>{canGlobal ? 'Avisa si se cruza con cualquier otro evento.' : 'Solo el administrador principal o quien tenga el permiso.'}</small>
            </span>
          </label>
        </fieldset>
      </div>

      <div className={styles.field}>
        <label htmlFor="ev-church">{scope === 'LOCAL' ? 'Iglesia' : 'Iglesia organizadora (opcional)'}</label>
        <select id="ev-church" value={churchId ?? ''} onChange={(e) => setChurchId(e.target.value)}>
          {scope === 'GLOBAL' && <option value="">La Asociación</option>}
          {(scope === 'LOCAL' ? iglesiasParaLocal : iglesiasParaGlobal).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.row3}>
        <div className={styles.field}>
          <label htmlFor="ev-date">Fecha</label>
          <input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="ev-start">Empieza</label>
          <input id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        </div>
        <div className={styles.field}>
          <label htmlFor="ev-end">Termina</label>
          <input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
        </div>
      </div>

      <label className={styles.check}>
        <input type="checkbox" checked={otroDia} onChange={(e) => { setOtroDia(e.target.checked); if (e.target.checked && !endDate) setEndDate(date); }} />
        <span>Termina otro día (intensivos, retiros)</span>
      </label>
      {otroDia && (
        <div className={styles.field}>
          <label htmlFor="ev-enddate">Fecha en que termina</label>
          <input id="ev-enddate" type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      )}

      {mode === 'create' && (
        <div className={styles.repeatBox}>
          <div className={styles.field}>
            <label htmlFor="ev-repeat">¿Se repite?</label>
            <select
              id="ev-repeat"
              value={repeat}
              onChange={(e) => {
                const v = e.target.value as '' | RepeatFrequency;
                setRepeat(v);
                if (v && !until && date) setUntil(finDeAnio(date));
              }}
            >
              <option value="">No, es una sola vez</option>
              <option value="WEEKLY">Cada semana, {date ? describirSemanal(date) : 'el mismo día'}</option>
              <option value="MONTHLY_BY_WEEKDAY">Cada mes, {date ? describirMensual(date) : 'el mismo día de la semana'}</option>
            </select>
          </div>
          {repeat && (
            <div className={styles.field}>
              <label htmlFor="ev-until">Hasta qué fecha (incluida)</label>
              <input id="ev-until" type="date" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
              <small className={styles.hint}>
                Como mucho un año. Cada fecha queda como evento propio: después se puede mover o cancelar una sola sin tocar las demás.
              </small>
            </div>
          )}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="ev-location">Lugar (opcional)</label>
        <input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={300} placeholder="Ej. Templo central, salón de jóvenes" />
      </div>

      <div className={styles.directorsBox}>
        <div className={styles.directorsHead}>
          <span className={styles.label}>Encargados</span>
          {scope === 'GLOBAL' && (
            <label className={styles.inlineSelect}>
              <span>Ver encargados de</span>
              <select value={iglesiaEncargados} onChange={(e) => setIglesiaEncargados(e.target.value)}>
                <option value="">— elige una iglesia —</option>
                {allChurches.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {seleccionados.size > 0 && (
          <div className={styles.chipsRow}>
            {Array.from(seleccionados.values()).map((s) => (
              <button
                key={s.id}
                type="button"
                className={styles.chipRemovable}
                onClick={() => setSeleccionados((prev) => { const n = new Map(prev); n.delete(s.id); return n; })}
                title="Quitar"
              >
                {s.nombre}{s.iglesia ? ` · ${s.iglesia}` : ''} ×
              </button>
            ))}
          </div>
        )}

        {cargandoCatalogo ? (
          <p className={styles.hint}>Cargando encargados…</p>
        ) : catalogo.length === 0 ? (
          <p className={styles.hint}>
            {iglesiaEncargados
              ? 'Esta iglesia todavía no tiene directores registrados. Se agregan desde la ficha de la iglesia.'
              : 'Elige una iglesia para ver sus directores.'}
          </p>
        ) : (
          <ul className={styles.directorsList}>
            {catalogo.map((d) => (
              <li key={d.id}>
                <label className={styles.check}>
                  <input type="checkbox" checked={seleccionados.has(d.id)} onChange={() => alternarEncargado(d)} />
                  <span>
                    {d.displayName}
                    {d.role ? <small> · {d.role}</small> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="ev-desc">Descripción (opcional)</label>
        <textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} />
      </div>

      {cruces && (
        <section className={`${styles.conflicts} ${hayCruces ? styles.conflictsBad : styles.conflictsOk}`} aria-live="polite">
          {hayCruces ? (
            <>
              <h3 className={styles.conflictsTitle}>Este evento se cruza con otros ya programados</h3>
              <ul className={styles.conflictsList}>
                {cruces.map((f) => (
                  <li key={f.startsAt}>
                    <strong>{formatDiaLargo(f.startsAt)} · {formatRango(f.startsAt, f.endsAt)}</strong>
                    <ul>
                      {f.conflicts.map((c) => (
                        <li key={c.eventId}>{describirCruce(c)}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <p className={styles.hint}>
                Puedes cambiar la fecha u hora, o guardar de todos modos. Si guardas, el cruce queda registrado y aparecerá en los avisos hasta que se resuelva.
              </p>
            </>
          ) : (
            <p className={styles.conflictsOkText}>No se cruza con ningún evento. Puedes guardar con tranquilidad.</p>
          )}
        </section>
      )}

      <footer className={styles.formActions}>
        <button type="button" className={styles.ghostBtn} onClick={onCancel} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => void revisarCruces()} disabled={revisando || guardando}>
          {revisando ? 'Revisando…' : 'Revisar cruces'}
        </button>
        {hayCruces ? (
          <button type="button" className={styles.dangerBtn} onClick={() => void guardar(true)} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar de todos modos'}
          </button>
        ) : (
          <button type="submit" className={styles.primaryBtn} disabled={guardando}>
            {guardando ? 'Guardando…' : mode === 'create' ? 'Programar' : 'Guardar cambios'}
          </button>
        )}
      </footer>
    </form>
  );
}
