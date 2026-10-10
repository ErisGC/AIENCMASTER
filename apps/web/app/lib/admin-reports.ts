import { API_BASE_URL, API_DIRECT_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';

export type ReportType =
  'OFFERINGS' | 'ATTENDANCE' | 'EXPENSES' | 'EVENT' | 'REQUEST' | 'OTHER';

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  OFFERINGS: 'Ofrendas',
  ATTENDANCE: 'Asistencia',
  EXPENSES: 'Gasto / egreso',
  EVENT: 'Evento especial',
  REQUEST: 'Solicitud',
  OTHER: 'Otro',
};

export type ExpenseCategory =
  'PURCHASE' | 'REPAIR' | 'DAMAGE' | 'THEFT' | 'UTILITIES' | 'OTHER';

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
  /**
   * Documentos adjuntos que puede ver quien consulta. Son privados: el
   * principal los ve todos; un administrador, solo los que él subió.
   */
  documents?: ReportDocument[];
}

export type ReportDocumentKind = 'pdf' | 'image' | 'word' | 'excel';

export interface ReportDocument {
  id: string;
  fileName: string;
  mimeType: string;
  kind: ReportDocumentKind;
  sizeBytes: number;
  uploadedByAdminAccountId: string;
  uploadedByDisplayName: string;
  createdAt: string;
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
  withDocuments?: boolean;
}

async function reportsRequest<T>(path: string, init?: RequestInit): Promise<T> {
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
    // Los rechazos propios de informes vienen en español y explican el
    // motivo (por ejemplo, documentos de otra persona); se muestran tal cual.
    // Los mensajes técnicos en inglés se siguen reemplazando por el genérico.
    if (res.status === 403) {
      try {
        const cuerpo = JSON.parse(text) as { message?: unknown };
        if (
          typeof cuerpo.message === 'string' &&
          /[áéíóúñ]|permiso|informe/i.test(cuerpo.message)
        ) {
          throw new Error(cuerpo.message);
        }
      } catch (err) {
        if (err instanceof Error && !(err instanceof SyntaxError)) throw err;
      }
    }
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

/* ───────── Documentos ───────── */

export const DOCUMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';
export const DOCUMENT_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'doc',
  'docx',
  'xls',
  'xlsx',
];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_UPLOAD = 5;
export const MAX_DOCUMENTS_PER_REPORT = 10;

export const DOCUMENT_KIND_LABELS: Record<ReportDocumentKind, string> = {
  pdf: 'PDF',
  image: 'Imagen',
  word: 'Word',
  excel: 'Excel',
};

/** Un informe entregado solo como documento, sin los datos del formulario. */
export function isDocumentOnly(report: Pick<ReportSummary, 'data'>): boolean {
  return (
    (report.data as { documentOnly?: unknown } | undefined)?.documentOnly ===
    true
  );
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Revisa un archivo antes de subirlo. Devuelve el motivo si no sirve. */
export function documentProblem(file: File): string | null {
  const partes = file.name.split('.');
  const ext = partes.length > 1 ? (partes.pop() ?? '').toLowerCase() : '';
  if (!DOCUMENT_EXTENSIONS.includes(ext)) {
    return `«${file.name}» no es un tipo permitido. Se aceptan PDF, imágenes JPG, PNG o WEBP, Word y Excel.`;
  }
  if (file.size === 0) return `«${file.name}» está vacío.`;
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `«${file.name}» pesa ${formatBytes(file.size)}; el máximo es 10 MB.`;
  }
  return null;
}

async function mensajeDeError(
  res: Response,
  porDefecto: string,
): Promise<string> {
  if (res.status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  if (res.status === 403) {
    return 'No tienes permiso para adjuntar documentos a este informe.';
  }
  if (res.status === 404) return 'El informe o el documento ya no existe.';
  if (res.status >= 500) {
    return 'El servidor no pudo guardar el documento. Intenta de nuevo.';
  }
  try {
    const cuerpo = (await res.json()) as { message?: unknown };
    if (typeof cuerpo.message === 'string' && cuerpo.message.trim()) {
      return cuerpo.message;
    }
  } catch {
    /* sin cuerpo legible */
  }
  return porDefecto;
}

/**
 * Sube documentos a un informe.
 *
 * Pide primero, con la sesión normal, un permiso temporal para ese informe, y
 * con él envía los archivos directo al servidor, sin pasar por el proxy de la
 * web: así se pueden subir documentos de hasta 10 MB.
 */
export async function adminUploadReportDocuments(
  reportId: string,
  files: File[],
): Promise<ReportDocument[]> {
  if (files.length === 0) return [];
  const permiso = await reportsRequest<{ ticket: string; uploadPath: string }>(
    `/admin/reports/${reportId}/documents/upload-ticket`,
    { method: 'POST', body: JSON.stringify({}) },
  );

  const subidos: ReportDocument[] = [];
  // De a cinco, que es lo que admite cada envío.
  for (let i = 0; i < files.length; i += MAX_DOCUMENTS_PER_UPLOAD) {
    const form = new FormData();
    for (const f of files.slice(i, i + MAX_DOCUMENTS_PER_UPLOAD)) {
      form.append('files', f, f.name);
    }
    let res: Response;
    try {
      res = await fetch(`${API_DIRECT_URL}${permiso.uploadPath}`, {
        method: 'POST',
        headers: { 'X-Aienc-Upload-Ticket': permiso.ticket },
        body: form,
      });
    } catch {
      throw new Error(
        'No hubo conexión con el servidor al subir los documentos.',
      );
    }
    if (!res.ok) {
      throw new Error(
        await mensajeDeError(res, 'No se pudieron subir los documentos.'),
      );
    }
    subidos.push(...((await res.json()) as ReportDocument[]));
  }
  return subidos;
}

export function adminGetReportDocumentUrl(
  reportId: string,
  documentId: string,
) {
  return reportsRequest<{ url: string; expiresAt: string; fileName: string }>(
    `/admin/reports/${reportId}/documents/${documentId}/url`,
  );
}

export function adminDeleteReportDocument(
  reportId: string,
  documentId: string,
) {
  return reportsRequest<{ deleted: boolean; id: string }>(
    `/admin/reports/${reportId}/documents/${documentId}`,
    { method: 'DELETE' },
  );
}

/**
 * Abre un documento en una pestaña nueva. La pestaña se abre en el mismo
 * clic, antes de pedir el enlace, para que el navegador no la bloquee.
 */
export async function openReportDocument(reportId: string, documentId: string) {
  const ventana = window.open('', '_blank');
  try {
    const { url } = await adminGetReportDocumentUrl(reportId, documentId);
    if (ventana) {
      ventana.opener = null;
      ventana.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (err) {
    ventana?.close();
    throw err;
  }
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Período en palabras. Los períodos se guardan como medianoche UTC del día
 * elegido, así que se leen en UTC.
 *  - Un mes completo: «septiembre de 2026».
 *  - Un solo día: «14 de septiembre de 2026».
 *  - Otro rango: «1 de septiembre al 15 de octubre de 2026».
 */
export function formatPeriodo(inicioIso: string, finIso: string): string {
  const a = new Date(inicioIso);
  const b = new Date(finIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const dA = a.getUTCDate();
  const mA = a.getUTCMonth();
  const yA = a.getUTCFullYear();
  const dB = b.getUTCDate();
  const mB = b.getUTCMonth();
  const yB = b.getUTCFullYear();
  const ultimoDelMes = new Date(Date.UTC(yB, mB + 1, 0)).getUTCDate();
  if (yA === yB && mA === mB && dA === 1 && dB === ultimoDelMes) {
    return `${MESES[mA]} de ${yA}`;
  }
  if (yA === yB && mA === mB && dA === dB) {
    return `${dA} de ${MESES[mA]} de ${yA}`;
  }
  const inicio =
    yA === yB ? `${dA} de ${MESES[mA]}` : `${dA} de ${MESES[mA]} de ${yA}`;
  return `${inicio} al ${dB} de ${MESES[mB]} de ${yB}`;
}

/** Encabezado de grupo por mes del período: «Septiembre de 2026». */
export function mesDelPeriodo(inicioIso: string): string {
  const a = new Date(inicioIso);
  if (Number.isNaN(a.getTime())) return 'Sin fecha';
  const texto = `${MESES[a.getUTCMonth()]} de ${a.getUTCFullYear()}`;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
