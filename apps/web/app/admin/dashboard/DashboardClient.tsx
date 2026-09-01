'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  adminGetMetricsTimeline,
  type MetricsTimelineResponse,
  type MetricsTimelinePoint,
} from '@/app/lib/admin-reports';
import { adminGetChurches, type Church } from '@/app/lib/admin-churches';
import { useActiveChurch } from '../_components/ActiveChurchContext';

import styles from './page.module.css';

const MONTH_LABEL = new Intl.DateTimeFormat('es-CO', {
  month: 'short',
  year: '2-digit',
});

function formatMonth(yyyyMm: string): string {
  // "YYYY-MM" → label
  const [y, m] = yyyyMm.split('-').map((s) => Number(s));
  if (!y || !m) return yyyyMm;
  return MONTH_LABEL.format(new Date(y, m - 1, 1));
}

function formatCop(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')}`;
}

/**
 * Devuelve los últimos 6 meses por defecto (fromDate inclusivo).
 */
function defaultFromDate(): string {
  // Se fija el día 1 ANTES de restar meses. Al revés, un 31 de julio menos
  // cinco meses daba "31 de febrero", que desborda a marzo, y el rango salía
  // de cinco meses en vez de seis.
  const hoy = new Date();
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 5);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  // En UTC, igual que el inicio del rango: usar la fecha local aquí y UTC allá
  // producía rangos distintos según la hora del día.
  const hoy = new Date();
  return new Date(
    Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()),
  )
    .toISOString()
    .slice(0, 10);
}

export function DashboardClient() {
  const { activeChurchId, isRoot, isLoaded } = useActiveChurch();

  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());
  const [filterChurchId, setFilterChurchId] = useState<string>('');
  const [churches, setChurches] = useState<Church[]>([]);
  const [metrics, setMetrics] = useState<MetricsTimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ROOT puede filtrar por iglesia; admin no-ROOT siempre usa su iglesia activa.
  const effectiveChurchId = isRoot ? filterChurchId : activeChurchId ?? '';

  const load = useCallback(async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await adminGetMetricsTimeline({
        churchId: effectiveChurchId || undefined,
        fromDate,
        toDate,
      });
      setMetrics(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar las métricas.',
      );
    } finally {
      setLoading(false);
    }
  }, [isLoaded, effectiveChurchId, fromDate, toDate]);

  useEffect(() => {
    if (!isRoot) return;
    void adminGetChurches()
      .then(setChurches)
      .catch(() => setChurches([]));
  }, [isRoot]);

  useEffect(() => {
    void load();
  }, [load]);

  // Totales agregados para los KPIs
  const totals = useMemo(() => {
    if (!metrics) {
      return { offerings: 0, expenses: 0, attendance: 0, net: 0 };
    }
    const sumOf = (arr: MetricsTimelinePoint[]) =>
      arr.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
    const offerings = sumOf(metrics.offerings);
    const expenses = sumOf(metrics.expenses);
    const attendance = sumOf(metrics.attendance);
    return {
      offerings,
      expenses,
      attendance,
      net: offerings - expenses,
    };
  }, [metrics]);

  // Mapeo unificado de meses para alinear las tres series
  const monthlyData = useMemo(() => {
    if (!metrics) return [] as Array<{
      month: string;
      offerings: number;
      expenses: number;
      attendance: number;
    }>;
    const map = new Map<string, { offerings: number; expenses: number; attendance: number }>();
    const ensure = (m: string) => {
      if (!map.has(m)) map.set(m, { offerings: 0, expenses: 0, attendance: 0 });
      return map.get(m)!;
    };
    metrics.offerings.forEach((p) => (ensure(p.month).offerings = p.total));
    metrics.expenses.forEach((p) => (ensure(p.month).expenses = p.total));
    metrics.attendance.forEach((p) => (ensure(p.month).attendance = p.total));
    return Array.from(map.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [metrics]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Métricas y resumen</h1>
          <p className={styles.subtitle}>
            Vista consolidada de ofrendas, egresos y asistencia para apoyar
            decisiones internas y soportes ante la DIAN.
          </p>
        </div>

        <div className={styles.filters}>
          {isRoot && (
            <div className={styles.filterGroup}>
              <label>Iglesia</label>
              <select
                value={filterChurchId}
                onChange={(e) => setFilterChurchId(e.target.value)}
              >
                <option value="">Todas las iglesias</option>
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
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className={styles.filterGroup}>
            <label>Hasta</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.kpiGrid}>
        <div className={`${styles.kpi} ${styles.kpi_offerings}`}>
          <span className={styles.kpiLabel}>Ofrendas</span>
          <span className={styles.kpiValue}>{formatCop(totals.offerings)}</span>
          <span className={styles.kpiSub}>Total del período seleccionado</span>
        </div>
        <div className={`${styles.kpi} ${styles.kpi_expenses}`}>
          <span className={styles.kpiLabel}>Egresos</span>
          <span className={styles.kpiValue}>{formatCop(totals.expenses)}</span>
          <span className={styles.kpiSub}>Gastos reportados</span>
        </div>
        <div className={`${styles.kpi} ${styles.kpi_net}`}>
          <span className={styles.kpiLabel}>Balance</span>
          <span className={styles.kpiValue}>{formatCop(totals.net)}</span>
          <span className={styles.kpiSub}>Ofrendas − egresos</span>
        </div>
        <div className={`${styles.kpi} ${styles.kpi_attendance}`}>
          <span className={styles.kpiLabel}>Asistencia</span>
          <span className={styles.kpiValue}>
            {totals.attendance.toLocaleString('es-CO')}
          </span>
          <span className={styles.kpiSub}>Sumatoria del período</span>
        </div>
      </div>

      <section className={styles.chartCard}>
        <div className={styles.chartHead}>
          <h2 className={styles.chartTitle}>Ofrendas vs Egresos por mes</h2>
          <ul className={styles.legend}>
            <li className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.swatch_offerings}`} />
              Ofrendas
            </li>
            <li className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.swatch_expenses}`} />
              Egresos
            </li>
          </ul>
        </div>
        <div className={styles.chartWrap}>
          {loading ? (
            <p className={styles.empty}>Cargando datos…</p>
          ) : monthlyData.length === 0 ? (
            <p className={styles.empty}>
              No hay datos en este rango. Prueba ampliando el período.
            </p>
          ) : (
            <FinanceBarChart data={monthlyData} />
          )}
        </div>
      </section>

      <section className={styles.chartCard}>
        <div className={styles.chartHead}>
          <h2 className={styles.chartTitle}>Asistencia mensual</h2>
          <ul className={styles.legend}>
            <li className={styles.legendItem}>
              <span className={`${styles.legendSwatch} ${styles.swatch_attendance}`} />
              Asistentes (suma del mes)
            </li>
          </ul>
        </div>
        <div className={styles.chartWrap}>
          {loading ? (
            <p className={styles.empty}>Cargando datos…</p>
          ) : monthlyData.length === 0 ? (
            <p className={styles.empty}>
              No hay datos en este rango. Prueba ampliando el período.
            </p>
          ) : (
            <AttendanceLineChart data={monthlyData} />
          )}
        </div>
      </section>

      {isRoot && metrics && metrics.byChurch.length > 0 && (
        <section className={styles.chartCard}>
          <div className={styles.chartHead}>
            <h2 className={styles.chartTitle}>Resumen por iglesia</h2>
          </div>
          <table className={styles.byChurchTable}>
            <thead>
              <tr>
                <th>Iglesia</th>
                <th className="num">Ofrendas</th>
                <th className="num">Egresos</th>
                <th className="num">Asistencia</th>
              </tr>
            </thead>
            <tbody>
              {metrics.byChurch.map((row) => {
                const name =
                  churches.find((c) => c.id === row.churchId)?.name ??
                  row.churchId.slice(0, 8);
                return (
                  <tr key={row.churchId}>
                    <td>{name}</td>
                    <td className="num">{formatCop(row.offerings)}</td>
                    <td className="num">{formatCop(row.expenses)}</td>
                    <td className="num">
                      {row.attendance.toLocaleString('es-CO')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/* ─────────── Charts (inline SVG, sin libs) ─────────── */

interface MonthlyRow {
  month: string;
  offerings: number;
  expenses: number;
  attendance: number;
}

function FinanceBarChart({ data }: { data: MonthlyRow[] }) {
  const width = Math.max(420, data.length * 80);
  const height = 260;
  const pad = { top: 18, right: 12, bottom: 36, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(
    1,
    ...data.flatMap((r) => [r.offerings, r.expenses]),
  );
  const groupW = innerW / data.length;
  const barW = Math.min(28, groupW * 0.36);
  const gap = 4;

  const ticks = 4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className={styles.chart}
      role="img"
      aria-label="Gráfico de barras: ofrendas y egresos por mes"
    >
      {/* y-axis grid lines + labels */}
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const ratio = i / ticks;
        const y = pad.top + innerH * (1 - ratio);
        const value = Math.round(max * ratio);
        return (
          <g key={i}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y}
              y2={y}
              stroke="var(--border-soft)"
              strokeWidth={1}
            />
            <text
              x={pad.left - 6}
              y={y + 4}
              fontSize={10}
              textAnchor="end"
              fill="var(--text-muted)"
            >
              {formatCop(value)}
            </text>
          </g>
        );
      })}

      {/* bars */}
      {data.map((row, idx) => {
        const cx = pad.left + idx * groupW + groupW / 2;
        const offY = pad.top + innerH * (1 - row.offerings / max);
        const expY = pad.top + innerH * (1 - row.expenses / max);
        return (
          <g key={row.month}>
            <rect
              x={cx - barW - gap / 2}
              y={offY}
              width={barW}
              height={Math.max(0, pad.top + innerH - offY)}
              rx={3}
              fill="var(--gem-emerald)"
            />
            <rect
              x={cx + gap / 2}
              y={expY}
              width={barW}
              height={Math.max(0, pad.top + innerH - expY)}
              rx={3}
              fill="var(--danger, #d14b4b)"
            />
            <text
              x={cx}
              y={pad.top + innerH + 18}
              fontSize={11}
              textAnchor="middle"
              fill="var(--text-muted)"
            >
              {formatMonth(row.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AttendanceLineChart({ data }: { data: MonthlyRow[] }) {
  const width = Math.max(420, data.length * 80);
  const height = 240;
  const pad = { top: 18, right: 12, bottom: 36, left: 48 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(1, ...data.map((r) => r.attendance));
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const points = data.map((r, i) => {
    const x = pad.left + i * step;
    const y = pad.top + innerH * (1 - r.attendance / max);
    return { x, y, row: r };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const area = `${path} L ${points[points.length - 1].x.toFixed(1)} ${
    pad.top + innerH
  } L ${points[0].x.toFixed(1)} ${pad.top + innerH} Z`;

  const ticks = 4;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className={styles.chart}
      role="img"
      aria-label="Gráfico de línea: asistencia mensual"
    >
      <defs>
        <linearGradient id="attFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--gem-sapphire)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--gem-sapphire)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {Array.from({ length: ticks + 1 }, (_, i) => {
        const ratio = i / ticks;
        const y = pad.top + innerH * (1 - ratio);
        const value = Math.round(max * ratio);
        return (
          <g key={i}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y}
              y2={y}
              stroke="var(--border-soft)"
              strokeWidth={1}
            />
            <text
              x={pad.left - 6}
              y={y + 4}
              fontSize={10}
              textAnchor="end"
              fill="var(--text-muted)"
            >
              {value}
            </text>
          </g>
        );
      })}

      <path d={area} fill="url(#attFill)" />
      <path
        d={path}
        fill="none"
        stroke="var(--gem-sapphire)"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {points.map((p) => (
        <g key={p.row.month}>
          <circle cx={p.x} cy={p.y} r={4} fill="var(--gem-sapphire)" />
          <text
            x={p.x}
            y={pad.top + innerH + 18}
            fontSize={11}
            textAnchor="middle"
            fill="var(--text-muted)"
          >
            {formatMonth(p.row.month)}
          </text>
        </g>
      ))}
    </svg>
  );
}
