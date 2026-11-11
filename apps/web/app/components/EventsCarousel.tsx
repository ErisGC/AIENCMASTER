'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import {
  ZONA,
  claveDia,
  etiquetaTipo,
  formatHora,
  type PublicEvent,
} from '@/app/lib/events';

import styles from './EventsCarousel.module.css';

const AUTOPLAY_MS = 6000;

const fmtDia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', timeZone: ZONA });
const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: ZONA });
const fmtSemana = new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: ZONA });

function cuando(e: PublicEvent, hoy: string, manana: string) {
  const k = claveDia(e.startsAt);
  const dia =
    k === hoy ? 'Hoy' : k === manana ? 'Mañana' : fmtSemana.format(new Date(e.startsAt));
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${formatHora(e.startsAt)}`;
}

/**
 * Próximos eventos en la portada. Las tarjetas se deslizan con el dedo o con
 * las flechas, y avanzan solas mientras nadie las está tocando (si el sistema
 * pide menos movimiento, no avanzan solas). Cada tarjeta lleva al día del
 * evento en el cronograma.
 */
export function EventsCarousel({ events, today }: { events: PublicEvent[]; today: string }) {
  const pista = useRef<HTMLDivElement | null>(null);
  const [pausado, setPausado] = useState(false);
  const [alInicio, setAlInicio] = useState(true);
  const [alFinal, setAlFinal] = useState(false);

  const manana = (() => {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  })();

  function medir() {
    const el = pista.current;
    if (!el) return;
    setAlInicio(el.scrollLeft <= 4);
    setAlFinal(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }

  function mover(sentido: 1 | -1) {
    const el = pista.current;
    if (!el) return;
    const tarjeta = el.querySelector<HTMLElement>('[data-tarjeta]');
    const paso = tarjeta ? tarjeta.offsetWidth + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: paso * sentido, behavior: 'smooth' });
  }

  useEffect(() => {
    medir();
    const el = pista.current;
    if (!el) return;
    const onResize = () => medir();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (pausado || events.length < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => {
      const el = pista.current;
      if (!el) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        mover(1);
      }
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [pausado, events.length]);

  if (events.length === 0) return null;

  return (
    <div
      className={styles.wrap}
      aria-roledescription="carrusel"
      aria-label="Próximos eventos"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPausado(false);
      }}
      onTouchStart={() => setPausado(true)}
    >
      <div className={styles.track} ref={pista} onScroll={medir}>
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/events?dia=${claveDia(e.startsAt)}`}
            className={styles.card}
            data-tarjeta
          >
            <div className={styles.date} aria-hidden>
              <span className={styles.day}>{fmtDia.format(new Date(e.startsAt))}</span>
              <span className={styles.month}>
                {fmtMes.format(new Date(e.startsAt)).replace('.', '')}
              </span>
            </div>
            <div className={styles.info}>
              <span className={styles.when}>{cuando(e, today, manana)}</span>
              <h3 className={styles.title}>{e.title}</h3>
              <div className={styles.tags}>
                <span className={styles.type}>{etiquetaTipo(e)}</span>
                <span className={styles.where}>
                  {e.scope === 'GLOBAL' ? 'Toda la Asociación' : (e.churchName ?? 'Iglesia')}
                </span>
              </div>
              {e.location && <p className={styles.location}>{e.location}</p>}
            </div>
          </Link>
        ))}
      </div>

      {events.length > 1 && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => mover(-1)}
            disabled={alInicio}
            aria-label="Eventos anteriores"
          >
            ←
          </button>
          <button
            type="button"
            className={styles.arrow}
            onClick={() => mover(1)}
            disabled={alFinal}
            aria-label="Más eventos"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
