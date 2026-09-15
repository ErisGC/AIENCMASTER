'use client';

import { claveDia, formatMes, type PublicEvent } from '@/app/lib/events';
import styles from './MonthCalendar.module.css';

/**
 * Cuadrícula mensual. Pensada para personas que no manejan sistemas: un mes
 * por pantalla, los días grandes, y cada evento como una etiqueta con color
 * según sea de una iglesia o de toda la Asociación. Tocar un día lo
 * selecciona; el detalle lo muestra quien la use (la agenda de al lado).
 *
 * Trabaja con claves "AAAA-MM-DD" calculadas en hora de Colombia, así que un
 * culto de las 7 de la noche cae en su día aunque el navegador o el servidor
 * estén en otra zona horaria.
 */

export interface MonthCalendarProps {
  year: number;
  /** 0 = enero. */
  month: number;
  events: PublicEvent[];
  selectedDay: string | null;
  onSelectDay: (clave: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Clave del día de hoy en Colombia, para resaltarlo. */
  today: string;
  /** Eventos con cruces, para marcarlos en la cuadrícula. */
  conflictIds?: Set<string>;
  onEventClick?: (event: PublicEvent) => void;
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MAX_CHIPS = 3;

function clave(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function MonthCalendar({
  year,
  month,
  events,
  selectedDay,
  onSelectDay,
  onPrev,
  onNext,
  onToday,
  today,
  conflictIds,
  onEventClick,
}: MonthCalendarProps) {
  // Aritmética de calendario pura (sin zona horaria): primer día de la
  // semana del mes y cuántos días tiene.
  const primerDiaSemana = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const diasDelMes = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const porDia = new Map<string, PublicEvent[]>();
  for (const e of events) {
    const k = claveDia(e.startsAt);
    const lista = porDia.get(k) ?? [];
    lista.push(e);
    porDia.set(k, lista);
  }

  const celdas: Array<{ day: number; clave: string } | null> = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasDelMes; d++) celdas.push({ day: d, clave: clave(year, month, d) });
  while (celdas.length % 7 !== 0) celdas.push(null);

  const titulo = formatMes(new Date(Date.UTC(year, month, 15, 12)));

  return (
    <section className={styles.calendar} aria-label={`Calendario de ${titulo}`}>
      <header className={styles.head}>
        <button type="button" className={styles.navBtn} onClick={onPrev} aria-label="Mes anterior">
          ‹
        </button>
        <div className={styles.headCenter}>
          <h2 className={styles.monthTitle}>{titulo}</h2>
          <button type="button" className={styles.todayBtn} onClick={onToday}>
            Hoy
          </button>
        </div>
        <button type="button" className={styles.navBtn} onClick={onNext} aria-label="Mes siguiente">
          ›
        </button>
      </header>

      <div className={styles.weekdays} aria-hidden="true">
        {DIAS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className={styles.grid} role="grid">
        {celdas.map((c, i) => {
          if (!c) return <div key={`v-${i}`} className={styles.cellEmpty} aria-hidden="true" />;
          const lista = porDia.get(c.clave) ?? [];
          const esHoy = c.clave === today;
          const seleccionado = c.clave === selectedDay;
          const visibles = lista.slice(0, MAX_CHIPS);
          const restantes = lista.length - visibles.length;
          return (
            <button
              key={c.clave}
              type="button"
              role="gridcell"
              aria-selected={seleccionado}
              aria-label={`${c.day}: ${lista.length} ${lista.length === 1 ? 'evento' : 'eventos'}`}
              className={[
                styles.cell,
                esHoy ? styles.cellToday : '',
                seleccionado ? styles.cellSelected : '',
                lista.length ? styles.cellBusy : '',
              ].join(' ')}
              onClick={() => onSelectDay(c.clave)}
            >
              <span className={styles.dayNumber}>{c.day}</span>
              <span className={styles.chips}>
                {visibles.map((e) => (
                  <span
                    key={e.id}
                    className={[
                      styles.chip,
                      e.scope === 'GLOBAL' ? styles.chipGlobal : styles.chipLocal,
                      conflictIds?.has(e.id) ? styles.chipConflict : '',
                    ].join(' ')}
                    title={e.title}
                    onClick={
                      onEventClick
                        ? (ev) => {
                            ev.stopPropagation();
                            onEventClick(e);
                          }
                        : undefined
                    }
                  >
                    {e.title}
                  </span>
                ))}
                {restantes > 0 && <span className={styles.more}>+{restantes} más</span>}
              </span>
            </button>
          );
        })}
      </div>

      <footer className={styles.legend} aria-label="Leyenda">
        <span>
          <i className={`${styles.dot} ${styles.dotGlobal}`} /> De toda la Asociación
        </span>
        <span>
          <i className={`${styles.dot} ${styles.dotLocal}`} /> De una iglesia
        </span>
        {conflictIds && conflictIds.size > 0 && (
          <span>
            <i className={`${styles.dot} ${styles.dotConflict}`} /> Con cruce de horario
          </span>
        )}
      </footer>
    </section>
  );
}
