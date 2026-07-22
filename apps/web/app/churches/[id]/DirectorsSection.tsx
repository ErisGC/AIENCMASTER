'use client';

import { useEffect, useState } from 'react';

import type { ChurchPublicDirector } from '@/app/lib/churches';
import styles from './page.module.css';

type Props = {
  directors: ChurchPublicDirector[];
};

export function DirectorsSection({ directors }: Props) {
  const [selected, setSelected] = useState<ChurchPublicDirector | null>(null);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [selected]);

  if (!directors || directors.length === 0) return null;

  return (
    <section className={styles.directorsSection}>
      <header className={styles.directorsHead}>
        <h2 className={styles.cardTitle}>Representantes</h2>
        <span className={styles.directorsCount}>
          {directors.length} {directors.length === 1 ? 'persona' : 'personas'}
        </span>
      </header>

      <ul className={styles.directorsGrid}>
        {directors.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              className={styles.directorCard}
              onClick={() => setSelected(d)}
              aria-haspopup="dialog"
            >
              <div className={styles.directorAvatarWrap}>
                {d.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.photoUrl}
                    alt={d.displayName}
                    className={styles.directorAvatar}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.directorAvatarFallback}>
                    {d.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className={styles.directorBody}>
                <strong className={styles.directorName}>{d.displayName}</strong>
                {d.role && <span className={styles.directorRole}>{d.role}</span>}
                <span className={styles.directorHint}>Ver más</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Información de ${selected.displayName}`}
          onClick={() => setSelected(null)}
        >
          <div
            className={styles.directorModal}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.modalClose}
              onClick={() => setSelected(null)}
              aria-label="Cerrar"
            >
              ✕
            </button>

            <div className={styles.directorModalPhoto}>
              {selected.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.photoUrl}
                  alt={selected.displayName}
                  className={styles.directorAvatar}
                />
              ) : (
                <div className={styles.directorAvatarFallback}>
                  {selected.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <h3 className={styles.directorModalName}>{selected.displayName}</h3>
            {selected.role && (
              <p className={styles.directorModalRole}>{selected.role}</p>
            )}

            <div className={styles.directorContact}>
              {selected.phone && (
                <a
                  href={`tel:${selected.phone.replace(/\s+/g, '')}`}
                  className={styles.contactRow}
                >
                  <span className={styles.contactLabel}>Celular</span>
                  <span className={styles.contactValue}>{selected.phone}</span>
                </a>
              )}
              {selected.email && (
                <a
                  href={`mailto:${selected.email}`}
                  className={styles.contactRow}
                >
                  <span className={styles.contactLabel}>Correo</span>
                  <span className={styles.contactValue}>{selected.email}</span>
                </a>
              )}
              {!selected.phone && !selected.email && (
                <p className={styles.emptyText}>
                  Sin datos de contacto públicos.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
