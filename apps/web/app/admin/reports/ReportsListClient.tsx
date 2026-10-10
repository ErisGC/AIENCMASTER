'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  adminListReports,
  adminDeleteReport,
  openReportDocument,
  formatBytes,
  formatPeriodo,
  isDocumentOnly,
  mesDelPeriodo,
  DOCUMENT_KIND_LABELS,
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
import { formatDateTime } from '@/app/lib/formatDate';

import styles from './page.module.css';

const REPORT_TYPES: ReportType[] = [
  'OFFERINGS',
  'ATTENDANCE',
  'EXPENSES',
  'EVENT',
  'REQUEST',
  'OTHER',
];

/** Informes por página. */
const PAGINA = 30;

/**
 * Resumen corto de un dato puntual del reporte para mostrar en la lista
 * (monto, categoría, scope, etc.) sin tener que abrir el detalle.
 */
function describeReport(report: ReportSummary): string | null {
  if (isDocumentOnly(report)) return null;
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
          ? (EXPENSE_CATEGORY_LABELS[d.category as ExpenseCategory] ??
            String(d.category))
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
          ? (REQUEST_STATUS_LABELS[d.status as RequestStatus] ??
            String(d.status))
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterChurchId, setFilterChurchId] = useState('');
  const [filterType, setFilterType] = useState<ReportType | ''>('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterWithDocs, setFilterWithDocs] = useState(false);

  // Evita que una respuesta vieja pise a una más nueva al cambiar filtros.
  const cargaVigente = useRef(0);

  const isRoot = session?.account?.role === 'ROOT';

  const query = useMemo<ReportsQuery>(() => {
    const q: ReportsQuery = { limit: PAGINA };
    if (filterChurchId) q.churchId = filterChurchId;
    if (filterType) q.reportType = filterType;
    if (filterFromDate) q.fromDate = filterFromDate;
    if (filterToDate) q.toDate = filterToDate;
    if (filterWithDocs) q.withDocuments = true;
    return q;
  }, [
    filterChurchId,
    filterType,
    filterFromDate,
    filterToDate,
    filterWithDocs,
  ]);

  const loadData = useCallback(async () => {
    const mia = ++cargaVigente.current;
    setLoading(true);
    try {
      const result = await adminListReports(query);
      if (mia !== cargaVigente.current) return;
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      if (mia !== cargaVigente.current) return;
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los informes.',
      );
    } finally {
      if (mia === cargaVigente.current) setLoading(false);
    }
  }, [query]);

  async function loadMore() {
    const mia = cargaVigente.current;
    setLoadingMore(true);
    try {
      const result = await adminListReports({ ...query, offset: items.length });
      if (mia !== cargaVigente.current) return;
      setItems((prev) => [...prev, ...result.items]);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar más informes.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

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

  async function handleDelete(report: ReportSummary) {
    const docs = report.documents?.length ?? 0;
    const aviso =
      docs > 0
        ? `¿Eliminar el informe "${report.title}" y sus ${docs} documento(s)? Esta acción no se puede deshacer.`
        : `¿Eliminar el informe "${report.title}"? Esta acción no se puede deshacer.`;
    if (!window.confirm(aviso)) return;
    try {
      await adminDeleteReport(report.id);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar el informe.',
      );
    }
  }

  async function abrirDocumento(reportId: string, documentId: string) {
    setError(null);
    try {
      await openReportDocument(reportId, documentId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo abrir el documento.',
      );
    }
  }

  const hasFilters = Boolean(
    filterChurchId ||
    filterType ||
    filterFromDate ||
    filterToDate ||
    filterWithDocs,
  );

  function clearFilters() {
    setFilterChurchId('');
    setFilterType('');
    setFilterFromDate('');
    setFilterToDate('');
    setFilterWithDocs(false);
  }

  // Agrupados por el mes del período, en el orden en que llegan (más
  // reciente primero), para ubicar rápido cada informe en el tiempo.
  const grupos = useMemo(() => {
    const out: Array<{ mes: string; informes: ReportSummary[] }> = [];
    for (const r of items) {
      const mes = mesDelPeriodo(r.periodStart);
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.mes === mes) ultimo.informes.push(r);
      else out.push({ mes, informes: [r] });
    }
    return out;
  }, [items]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Informes</h1>
          <p className={styles.subtitle}>
            Ofrendas, asistencia, egresos, eventos y solicitudes de cada
            iglesia, como soporte para los reportes ante la DIAN. Se pueden
            llenar con el formulario o entregar como documento.
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
            onChange={(e) =>
              setFilterType((e.target.value as ReportType) || '')
            }
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

        <label className={styles.filterCheck}>
          <input
            type="checkbox"
            checked={filterWithDocs}
            onChange={(e) => setFilterWithDocs(e.target.checked)}
          />
          <span>Solo con documentos</span>
        </label>

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
          grupos.map((g) => (
            <div key={g.mes} className={styles.monthGroup}>
              <h2 className={styles.monthTitle}>{g.mes}</h2>
              <ul className={styles.list}>
                {g.informes.map((report) => (
                  <li key={report.id} className={styles.item}>
                    <div className={styles.itemMain}>
                      <div className={styles.itemHead}>
                        <span
                          className={`${styles.typeBadge} ${styles[`type_${report.reportType}`]}`}
                        >
                          {REPORT_TYPE_LABELS[report.reportType]}
                        </span>
                        {report.church && (
                          <span className={styles.churchBadge}>
                            {report.church.name}
                          </span>
                        )}
                        {isDocumentOnly(report) && (
                          <span className={styles.docOnlyBadge}>
                            Entregado como documento
                          </span>
                        )}
                      </div>
                      <h3 className={styles.itemTitle}>{report.title}</h3>
                      {describeReport(report) && (
                        <p className={styles.itemSummary}>
                          {describeReport(report)}
                        </p>
                      )}

                      <dl className={styles.itemMeta}>
                        <dt>Período</dt>
                        <dd>
                          {formatPeriodo(report.periodStart, report.periodEnd)}
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

                      {(report.documents?.length ?? 0) > 0 && (
                        <ul className={styles.docList}>
                          {report.documents!.map((d) => (
                            <li key={d.id} className={styles.docItem}>
                              <span className={styles.docKind}>
                                {DOCUMENT_KIND_LABELS[d.kind] ?? d.kind}
                              </span>
                              <span className={styles.docName}>
                                {d.fileName}
                              </span>
                              <span className={styles.docMeta}>
                                {formatBytes(d.sizeBytes)} ·{' '}
                                {d.uploadedByDisplayName}
                              </span>
                              <span className={styles.docActions}>
                                <button
                                  type="button"
                                  className={styles.docBtn}
                                  onClick={() =>
                                    void abrirDocumento(report.id, d.id)
                                  }
                                >
                                  Abrir
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
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
                        onClick={() => void handleDelete(report)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        {!loading && items.length < total && (
          <div className={styles.moreRow}>
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore
                ? 'Cargando…'
                : `Cargar más (${total - items.length} restantes)`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
