'use client';

import { useEffect, useState } from 'react';

import styles from './page.module.css';

type Props = {
  lat: number | null;
  lng: number | null;
  mapsHref: string | null;
  name: string;
};

/** Construye la URL de OpenStreetMap incrustado (sin API key) centrada en el
 *  punto, con un marcador. `delta` controla el zoom (más chico = más cerca). */
function embedUrl(lat: number, lng: number, delta: number): string {
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta]
    .map((n) => n.toFixed(6))
    .join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(
    6,
  )}%2C${lng.toFixed(6)}`;
}

export function ChurchMap({ lat, lng, mapsHref, name }: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  const hasCoords = lat != null && lng != null;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Ubicación</h2>

      {hasCoords ? (
        <>
          <div className={styles.mapFrameWrap}>
            <iframe
              title={`Mapa de ${name}`}
              className={styles.mapFrame}
              src={embedUrl(lat, lng, 0.005)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <div className={styles.mapActions}>
            <button
              type="button"
              className={styles.mapExpandBtn}
              onClick={() => setExpanded(true)}
            >
              Ampliar mapa
            </button>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className={styles.secondaryLink}
              >
                Abrir en Google Maps
              </a>
            )}
          </div>
        </>
      ) : (
        <>
          <p className={styles.emptyText}>
            Esta iglesia aún no tiene una ubicación pública registrada.
          </p>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className={styles.secondaryLink}
            >
              Abrir en Google Maps
            </a>
          )}
        </>
      )}

      {expanded && hasCoords && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Mapa ampliado de ${name}`}
          onClick={() => setExpanded(false)}
        >
          <div
            className={styles.mapModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <strong>{name}</strong>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setExpanded(false)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <iframe
              title={`Mapa ampliado de ${name}`}
              className={styles.mapModalFrame}
              src={embedUrl(lat, lng, 0.012)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                className={styles.secondaryLink}
              >
                Abrir en Google Maps
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
