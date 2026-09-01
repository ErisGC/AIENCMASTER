'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Announcement } from '@/app/lib/announcements';
import { formatDateTime } from '@/app/lib/formatDate';

import styles from './AnnouncementsCarousel.module.css';

interface Props {
  announcements: Announcement[];
}

export function AnnouncementsCarousel({ announcements }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAnnouncements = announcements.length > 0;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resetAutoplay = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!hasAnnouncements) return;

    timeoutRef.current = setTimeout(() => {
      setDirection('right');
      setIndex((prev) => (prev + 1) % announcements.length);
    }, 5000);
  };

  const goTo = (nextIndex: number) => {
    if (nextIndex === index) return;

    setDirection(nextIndex > index ? 'right' : 'left');
    setIndex(nextIndex);
  };

  useEffect(() => {
    resetAutoplay();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [index, announcements.length, resetAutoplay]);

  if (!hasAnnouncements) {
    return null;
  }

  const current = announcements[index % announcements.length];

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <span className={styles.eyebrow}>Portada</span>
          <h3 className={styles.title}>Anuncios recientes</h3>
        </div>

        <Link href="/announcements" className={styles.seeAll}>
          Ver todos
        </Link>
      </div>

      <Link href={`/announcements/${current.id}`} className={styles.linkWrapper}>
        <article
          key={current.id}
          className={`${styles.card} ${styles.animated} ${styles[direction]}`}
        >
          <div className={styles.cardGlow} aria-hidden />

          <div className={styles.metaRow}>
            <span className={styles.badge}>Comunicado</span>
            <p className={styles.meta}>
              {current.author} - {formatDateTime(current.createdAt)}
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

            <div className={styles.indicators}>
              {announcements.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.indicator} ${
                    i === index ? styles.active : ''
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    goTo(i);
                  }}
                  aria-label={`Ir al anuncio ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </article>
      </Link>
    </section>
  );
}
