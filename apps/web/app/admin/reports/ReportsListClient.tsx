'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  adminListReports,
  adminDeleteReport,
  REPORT_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  REQUEST_STATUS_LABELS,
  type ReportSummary,
  type ReportType,
  type ReportsQuery,
  type ExpenseCategory,
  type RequestStatus,
} from '@/app/lib/admin-reports';
import { adminGetChurches, type Church } from '@/app/lib/admin-churches';
import {
  adminGetSession,
  type AdminSessionResponse,
} from '@/app/lib/admin-auth';
import { formatCalendarDate, formatDateTime } from '@/app/lib/formatDate';

import styles from './page.module.css';

const REPORT_TYPES: ReportType[] = [
  'OFFERINGS',
  'ATTENDANCE',
  'EXPENSES',
  'EVENT',
  'REQUEST',
  'OTHER',
];

/**
 * Resumen corto de un dato puntual del reporte para mostrar en la lista
 * (monto, categoría, scope, etc.) sin tener que abrir el detalle.
 */
function describeReport(report: ReportSummary): string | null {
  const d = report.data ?? {};
  switch (report.reportType) {
    case 'OFFERINGS':
      return d.totalCop != null
        ? `$${Number(d.totalCop).toLocaleString('es-CO')} COP`
        : null;
    case 'EXPENSES': {
      const amount =
        d.totalCop != null
          ? `$${Number(d.totalCop).toLocaleString('es-CO')} COP`
          : null;
      const cat =
        typeof d.category === 'string'
          ? EXPENSE_CATEGORY_LABELS[d.category as ExpenseCategory] ??
            String(d.category)
          : null;
      return [cat, amount].filter(Boolean).join(' · ') || null;
    }
    case 'ATTENDANCE': {
      const count = d.count != null ? `${d.count} asistentes` : null;
      const scope = d.scope === 'session' ? 'culto' : 'mensual';
      return count ? `${count} (${scope})` : null;
    }
    case 'EVENT':
      return typeof d.name === 'string' ? d.name : null;
    case 'REQUEST': {
      const subj = typeof d.subject === 'string' ? d.subject : null;
      const st =
        typeof d.status === 'string'
          ? REQUEST_STATUS_LABELS[d.status as RequestStatus] ??
            String(d.status)
          : null;
      return [subj, st].filter(Boolean).join(' · ') || null;
    }
    case 'OTHER':
      return typeof d.freeText === 'string'
        ? d.freeText.length > 80
          ? `${d.freeText.slice(0, 80)}…`
          : d.freeText
        : null;
    default:
      return null;
  }
}

export function ReportsListClient() {
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [items, setItems] = useState<ReportSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterChurchId, setFilterChurchId] = useState('');
  const [filterType, setFilterType] = useState<ReportType | ''>('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');

  const isRoot = session?.account?.role === 'ROOT';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const query: ReportsQuery = {};
      if (filterChurchId) query.churchId = filterChurchId;
      if (filterType) query.reportType = filterType;
      if (filterFromDate) query.fromDate = filterFromDate;
      if (filterToDate) query.toDate = filterToDate;

      const result = await adminListReports(query);
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudieron cargar los informes.',
      );
    } finally {
      setLoading(false);
    }
  }, [filterChurchId, filterType, filterFromDate, filterToDate]);

  useEffect(() => {
    void adminGetSession()
      .then(setSession)
      .catch(() => null);
  }, []);

  useEffect(() => {
    // Sólo cargar iglesias si es ROOT (los admins ven solo la suya)
    if (session?.account?.role === 'ROOT') {
      void adminGetChurches()
        .then(setChurches)
        .catch(() => setChurches([]));
    }
  }, [session]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`¿Eliminar el informe "${title}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await adminDeleteReport(id);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar el informe.',
      );
    }
  }

  const hasFilters = useMemo(
    () => Boolean(filterChurchId || filterType || filterFromDate || filterToDate),
    [filterChurchId, filterType, filterFromDate, filterToDate],
  );

  function clearFilters() {
    setFilterChurchId('');
    setFilterType('');
    setFilterFromDate('');
    setFilterToDate('');
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Informes</h1>
          <p className={styles.subtitle}>
            Generación y consulta de informes para soporte ante la DIAN:
            ofrendas, asistencia, egresos y eventos.
          </p>
        </div>
        <Link href="/admin/reports/new" className={styles.newBtn}>
          + Nuevo informe
        </Link>
      </header>

      <section className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Tipo</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType((e.target.value as ReportType) || '')}
          >
            <option value="">Todos</option>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {REPORT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {isRoot && (
          <div className={styles.filterGroup}>
            <label>Iglesia</label>
            <select
              value={filterChurchId}
              onChange={(e) => setFilterChurchId(e.target.value)}
            >
              <option value="">Todas</option>
              {churches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.filterGroup}>
          <label>Desde</label>
          <input
            type="date"
            value={filterFromDate}
            onChange={(e) => setFilterFromDate(e.target.value)}
          />
        </div>

        <div className={styles.filterGroup}>
          <label>Hasta</label>
          <input
            type="date"
            value={filterToDate}
            onChange={(e) => setFilterToDate(e.target.value)}
          />
        </div>

        {hasFilters && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={clearFilters}
          >
            Limpiar filtros
          </button>
        )}
      </section>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <section className={styles.results}>
        <div className={styles.resultsHeader}>
          <span>
            {loading
              ? 'Cargando...'
              : `${total} informe${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}`}
          </span>
        </div>

        {!loading && items.length === 0 && !error ? (
          <div className={styles.empty}>
            {hasFilters
              ? 'No hay informes que coincidan con los filtros.'
              : 'Aún no se han registrado informes. Empieza con el primero.'}
          </div>
        ) : (
          <ul className={styles.list}>
            {items.map((report) => (
              <li key={report.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <div className={styles.itemHead}>
                    <span
                      className={`${styles.typeBadge} ${styles[`type_${report.reportType}`]}`}
                    >
                      {REPORT_TYPE_LABELS[report.reportType]}
                    </span>
                    <h3 className={styles.itemTitle}>{report.title}</h3>
                  </div>
                  {describeReport(report) && (
                    <p className={styles.itemSummary}>{describeReport(report)}</p>
                  )}

                  <dl className={styles.itemMeta}>
                    {report.church && (
                      <>
                        <dt>Iglesia</dt>
                        <dd>{report.church.name}</dd>
                      </>
                    )}
                    <dt>Período</dt>
                    <dd>
                      {formatCalendarDate(report.periodStart)} —{' '}
                      {formatCalendarDate(report.periodEnd)}
                    </dd>
                    <dt>Creado por</dt>
                    <dd>{report.createdByDisplayName}</dd>
                    {report.lastUpdatedByDisplayName && (
                      <>
                        <dt>Última edición</dt>
                        <dd>
                          {report.lastUpdatedByDisplayName} (
                          {formatDateTime(report.updatedAt)})
                        </dd>
                      </>
                    )}
                  </dl>
                </div>

                <div className={styles.itemActions}>
                  <Link
                    href={`/admin/reports/${report.id}/edit`}
                    className={styles.editBtn}
                  >
                    Editar
                  </Link>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => void handleDelete(report.id, report.title)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
