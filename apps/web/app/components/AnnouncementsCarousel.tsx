'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Announcement } from '@/app/lib/announcements';
import { formatDateTime } from '@/app/lib/formatDate';

import styles from './AnnouncementsCarousel.module.css';

interface Props {
  announcements: Announcement[];
}

const AUTOPLAY_MS = 6000;

/**
 * Carrusel de la portada. Pasa solo de un anuncio a otro, pero se detiene
 * mientras el visitante lo tiene bajo el cursor o con el foco, para que el
 * anuncio no cambie justo cuando lo va a abrir. Si el sistema pide menos
 * movimiento, no avanza solo.
 *
 * El encabezado ("Últimos anuncios / Ver todos") lo pone la banda de la home;
 * aquí ya no se repite.
 */
export function AnnouncementsCarousel({ announcements }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [paused, setPaused] = useState(false);
  const total = announcements.length;

  useEffect(() => {
    if (total <= 1 || paused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setTimeout(() => {
      setDirection('right');
      setIndex((prev) => (prev + 1) % total);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, total, paused]);

  if (total === 0) {
    return null;
  }

  const current = announcements[index % total];

  const goTo = (nextIndex: number) => {
    if (nextIndex === index) return;
    setDirection(nextIndex > index ? 'right' : 'left');
    setIndex(nextIndex);
  };

  return (
    <section
      className={styles.container}
      aria-roledescription="carrusel"
      aria-label="Anuncios recientes"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className={styles.stage}>
        <Link href={`/announcements/${current.id}`} className={styles.linkWrapper}>
          <article
            key={current.id}
            className={`${styles.card} ${styles.animated} ${styles[direction]}`}
          >
            <div className={styles.cardGlow} aria-hidden />

            <div className={styles.metaRow}>
              <span className={styles.badge}>Comunicado</span>
              <p className={styles.meta}>
                {current.author} · {formatDateTime(current.createdAt)}
              </p>
            </div>

            <h3 className={styles.cardTitle}>{current.title}</h3>

            <p className={styles.excerpt}>
              {current.description.length > 180
                ? `${current.description.slice(0, 180)}…`
                : current.description}
            </p>

            <div className={styles.cardFooter}>
              <span className={styles.readMore}>Abrir anuncio</span>
            </div>
          </article>
        </Link>

        {/* Fuera del enlace: un botón dentro de un <a> no es válido y hacía
            que tocar un punto pudiera abrir el anuncio. */}
        {total > 1 && (
          <div className={styles.indicators}>
            {announcements.map((a, i) => (
              <button
                key={a.id}
                type="button"
                className={`${styles.indicator} ${i === index ? styles.active : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Ver el anuncio ${i + 1} de ${total}`}
                aria-current={i === index ? 'true' : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
