import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';

export type ReportType =
  | 'OFFERINGS'
  | 'ATTENDANCE'
  | 'EXPENSES'
  | 'EVENT'
  | 'REQUEST'
  | 'OTHER';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  OFFERINGS: 'Ofrendas',
  ATTENDANCE: 'Asistencia',
  EXPENSES: 'Gasto / egreso',
  EVENT: 'Evento especial',
  REQUEST: 'Solicitud',
  OTHER: 'Otro',
};

export type ExpenseCategory =
  | 'PURCHASE'
  | 'REPAIR'
  | 'DAMAGE'
  | 'THEFT'
  | 'UTILITIES'
  | 'OTHER';

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  PURCHASE: 'Compra (sillas, abanicos, materiales)',
  REPAIR: 'Reparación / pintura',
  DAMAGE: 'Reporte de daños',
  THEFT: 'Robo o pérdida',
  UTILITIES: 'Servicios públicos',
  OTHER: 'Otro gasto',
};

export type AttendanceScope = 'session' | 'month';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESOLVED';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  RESOLVED: 'Resuelta',
};

export interface ReportSummary {
  id: string;
  churchId: string;
  reportType: ReportType;
  title: string;
  notes: string;
  periodStart: string;
  periodEnd: string;
  data: Record<string, unknown>;
  createdByAdminAccountId: string;
  createdByDisplayName: string;
  lastUpdatedByAdminAccountId: string | null;
  lastUpdatedByDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
  church?: {
    id: string;
    name: string;
    city: string;
  };
}

export interface ReportListResponse {
  items: ReportSummary[];
  total: number;
}

export interface CreateReportPayload {
  churchId: string;
  reportType: ReportType;
  title: string;
  notes?: string;
  periodStart: string;
  periodEnd: string;
  data: Record<string, unknown>;
}

export type UpdateReportPayload = Partial<CreateReportPayload>;

export interface ReportsQuery {
  churchId?: string;
  reportType?: ReportType;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

async function reportsRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const body = init?.body;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    // Sesión caducada a mitad de la navegación: se lleva al acceso en vez de
    // dejar el aviso pegado en pantalla hasta la siguiente navegación.
    if (res.status === 401) manejarSesionExpirada(path);
    const text = await res.text().catch(() => '');
    if (typeof window !== 'undefined') {
      const log = res.status >= 500 ? console.error : console.debug;
      log('[admin-reports]', init?.method ?? 'GET', path, res.status, text);
    }
    const friendly =
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permiso sobre esta iglesia.'
          : res.status === 404
            ? 'Informe no encontrado.'
            : res.status === 400
              ? 'Datos inválidos.'
              : res.status >= 500
                ? 'Error del servidor. Intenta más tarde.'
                : 'No se pudo completar la solicitud.';
    throw new Error(friendly);
  }

  const txt = await res.text();
  if (!txt) return undefined as T;
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error('Respuesta inválida del servidor.');
  }
}

export function adminListReports(query: ReportsQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return reportsRequest<ReportListResponse>(
    `/admin/reports${qs ? `?${qs}` : ''}`,
  );
}

export function adminGetReport(id: string) {
  return reportsRequest<ReportSummary>(`/admin/reports/${id}`);
}

export function adminCreateReport(payload: CreateReportPayload) {
  return reportsRequest<ReportSummary>('/admin/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function adminUpdateReport(id: string, payload: UpdateReportPayload) {
  return reportsRequest<ReportSummary>(`/admin/reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function adminDeleteReport(id: string) {
  return reportsRequest<{ deleted: boolean; id: string }>(
    `/admin/reports/${id}`,
    { method: 'DELETE' },
  );
}

/* ───────── Métricas ───────── */

export interface MetricsTimelinePoint {
  month: string; // "YYYY-MM"
  total: number;
}

export interface MetricsByChurch {
  churchId: string;
  offerings: number;
  expenses: number;
  attendance: number;
}

export interface MetricsTimelineResponse {
  offerings: MetricsTimelinePoint[];
  expenses: MetricsTimelinePoint[];
  attendance: MetricsTimelinePoint[];
  byChurch: MetricsByChurch[];
}

export function adminGetMetricsTimeline(params: {
  churchId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const q = new URLSearchParams();
  if (params.churchId) q.set('churchId', params.churchId);
  if (params.fromDate) q.set('fromDate', params.fromDate);
  if (params.toDate) q.set('toDate', params.toDate);
  const qs = q.toString();
  return reportsRequest<MetricsTimelineResponse>(
    `/admin/reports/metrics/timeline${qs ? `?${qs}` : ''}`,
  );
}
