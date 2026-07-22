'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Announcement } from '@/app/lib/announcements';
import { API_BASE_URL } from '@/app/lib/api';
import { formatDateTime } from '@/app/lib/formatDate';

import { FiltersPanel } from './FiltersPanel';
import styles from './AnnouncementsList.module.css';

interface Props {
  initialItems: Announcement[];
  pageSize: number;
}

const EXCERPT_LIMIT = 180;

function buildExcerpt(text: string): string {
  if (text.length <= EXCERPT_LIMIT) return text;
  const sliced = text.slice(0, EXCERPT_LIMIT);
  const lastSpace = sliced.lastIndexOf(' ');
  const safe = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return `${safe}…`;
}

export function AnnouncementsList({ initialItems, pageSize }: Props) {
  const [items, setItems] = useState<Announcement[]>(initialItems);
  const [offset, setOffset] = useState(initialItems.length);
  const [hasMore, setHasMore] = useState(initialItems.length === pageSize);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);

  const [titleEnabled, setTitleEnabled] = useState(false);
  const [title, setTitle] = useState('');

  const [dateEnabled, setDateEnabled] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadPage = useCallback(
    async (reset: boolean, currentOffset: number, query: string) => {
      if (reset) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/announcements?${query}&offset=${currentOffset}`,
          { cache: 'no-store' },
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data: Announcement[] = await res.json();

        setItems((prev) => (reset ? data : [...prev, ...data]));
        setOffset(reset ? data.length : currentOffset + data.length);
        setHasMore(data.length === pageSize);
      } catch {
        setError('No se pudieron cargar los anuncios. Intenta de nuevo.');
        // No borramos lo que ya estaba visible: si una re-consulta falla,
        // el usuario conserva lo último que cargó bien (incluido lo que ya
        // había renderizado el servidor). Antes hacíamos setItems([]) aquí,
        // lo que tiraba a la basura datos buenos ante un fallo transitorio.
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [pageSize],
  );

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', String(pageSize));

    if (titleEnabled && title.trim()) {
      params.set('title', title.trim());
    }
    if (dateEnabled && fromDate) {
      params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
    }
    return params.toString();
  }, [pageSize, titleEnabled, title, dateEnabled, fromDate, toDate]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    // En el primer render confiamos en lo que ya trajo el servidor
    // (initialItems): así la home y esta página se comportan igual y una
    // re-consulta fallida del navegador no borra los anuncios ya cargados.
    // Solo si el servidor no trajo nada intentamos cargar desde el cliente.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      if (initialItems.length > 0) return;
    }
    setHasMore(true);
    void loadPage(true, 0, buildQuery());
  }, [loadPage, buildQuery, initialItems.length]);

  const handleLoadMore = () => {
    void loadPage(false, offset, buildQuery());
  };

  const filtersActive =
    (titleEnabled && title.trim().length > 0) ||
    (dateEnabled && fromDate.length > 0);

  const resultLabel =
    items.length === 1 ? '1 anuncio visible' : `${items.length} anuncios visibles`;

  return (
    <section className={styles.section}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarCopy}>
          <span className={styles.kicker}>Explorar</span>
          <p className={styles.resultText}>{resultLabel}</p>
        </div>

        <button
          type="button"
          className={`${styles.filterBtn} ${showFilters ? styles.filterActive : ''}`}
          onClick={() => setShowFilters((value) => !value)}
          aria-expanded={showFilters}
          aria-controls="filters-panel"
        >
          {showFilters ? 'Ocultar filtros' : filtersActive ? 'Filtros activos' : 'Filtrar'}
        </button>
      </div>

      {showFilters && (
        <div className={styles.filtersWrap} id="filters-panel">
          <FiltersPanel
            titleEnabled={titleEnabled}
            setTitleEnabled={setTitleEnabled}
            title={title}
            setTitle={setTitle}
            dateEnabled={dateEnabled}
            setDateEnabled={setDateEnabled}
            fromDate={fromDate}
            setFromDate={setFromDate}
            toDate={toDate}
            setToDate={setToDate}
          />
        </div>
      )}

      {error && (
        <div
          className={styles.emptyState}
          role="alert"
          style={{ color: '#dc2626' }}
        >
          <h2 className={styles.emptyTitle}>Ocurrió un problema</h2>
          <p className={styles.emptyText}>{error}</p>
          <button
            type="button"
            className={styles.loadMore}
            onClick={() => void loadPage(true, 0, buildQuery())}
          >
            Reintentar
          </button>
        </div>
      )}

      {!error && loading ? (
        <div className={styles.grid}>
          {Array.from({ length: pageSize }).map((_, i) => (
            <div
              key={i}
              className={styles.card}
              aria-busy="true"
              style={{ minHeight: 180, opacity: 0.5 }}
            />
          ))}
        </div>
      ) : !error && items.length > 0 ? (
        <section className={styles.grid}>
          {items.map((announcement) => (
            <Link
              key={announcement.id}
              href={`/announcements/${announcement.id}`}
              className={styles.linkWrapper}
            >
              <article className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardBadge}>Publicación</span>
                  <span className={styles.cardDate}>
                    {formatDateTime(announcement.createdAt)}
                  </span>
                </div>

                <h3 className={styles.cardTitle}>{announcement.title}</h3>

                <p className={styles.excerpt}>
                  {buildExcerpt(announcement.description)}
                </p>

                <footer className={styles.footer}>
                  <span>{announcement.author}</span>
                  <span className={styles.readMore}>Abrir detalle</span>
                </footer>
              </article>
            </Link>
          ))}
        </section>
      ) : !error && !loading ? (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>No hay anuncios para este filtro</h2>
          <p className={styles.emptyText}>
            Ajusta el título o el rango de fecha para volver a consultar el
            listado.
          </p>
        </div>
      ) : null}

      {!error && hasMore && !loading && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={handleLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? 'Cargando…' : 'Mostrar más'}
        </button>
      )}
    </section>
  );
}
