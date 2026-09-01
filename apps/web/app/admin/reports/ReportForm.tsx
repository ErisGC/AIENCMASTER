'use client';

import { useEffect, useMemo, useState } from 'react';

import { adminGetChurches, type Church } from '@/app/lib/admin-churches';
import {
  REPORT_TYPE_LABELS,
  EXPENSE_CATEGORY_LABELS,
  REQUEST_STATUS_LABELS,
  type ReportType,
  type ReportSummary,
  type CreateReportPayload,
  type ExpenseCategory,
  type RequestStatus,
  type AttendanceScope,
} from '@/app/lib/admin-reports';
import {
  adminGetSession,
  type AdminSessionResponse,
} from '@/app/lib/admin-auth';
import { useActiveChurch } from '../_components/ActiveChurchContext';

import styles from './page.module.css';

const REPORT_TYPES: ReportType[] = [
  'OFFERINGS',
  'ATTENDANCE',
  'EXPENSES',
  'EVENT',
  'REQUEST',
  'OTHER',
];

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'PURCHASE',
  'REPAIR',
  'DAMAGE',
  'THEFT',
  'UTILITIES',
  'OTHER',
];

const REQUEST_STATUSES: RequestStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'RESOLVED',
];

interface Props {
  initial?: ReportSummary | null;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (payload: CreateReportPayload) => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Formulario reutilizable para crear o editar un informe.
 * Renderiza campos específicos según `reportType`.
 *
 * Soporta los tipos extendidos:
 *   - EXPENSES con discriminador `data.category` (compras, robos, daños, etc.)
 *   - ATTENDANCE con `data.scope` (session/month) y `sessionDate` cuando aplica
 *   - REQUEST con `subject`, `status` y `body` para peticiones formales a ROOT
 */
export function ReportForm({
  initial,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: Props) {
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const { activeChurchId, assignments, isRoot: ctxIsRoot } = useActiveChurch();

  const [reportType, setReportType] = useState<ReportType>(
    initial?.reportType ?? 'OFFERINGS',
  );
  const [churchId, setChurchId] = useState<string>(initial?.churchId ?? '');
  const [title, setTitle] = useState<string>(initial?.title ?? '');
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const [periodStart, setPeriodStart] = useState<string>(
    initial ? toDateInput(initial.periodStart) : '',
  );
  const [periodEnd, setPeriodEnd] = useState<string>(
    initial ? toDateInput(initial.periodEnd) : '',
  );

  // Datos específicos por tipo
  const initialData = (initial?.data ?? {}) as Record<string, unknown>;

  const [totalCop, setTotalCop] = useState<string>(
    initialData.totalCop != null ? String(initialData.totalCop) : '',
  );
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>(
    typeof initialData.category === 'string' &&
      EXPENSE_CATEGORIES.includes(initialData.category as ExpenseCategory)
      ? (initialData.category as ExpenseCategory)
      : 'PURCHASE',
  );
  const [expenseDesc, setExpenseDesc] = useState<string>(
    typeof initialData.description === 'string' ? initialData.description : '',
  );

  const [attendanceScope, setAttendanceScope] = useState<AttendanceScope>(
    initialData.scope === 'session' ? 'session' : 'month',
  );
  const [sessionDate, setSessionDate] = useState<string>(
    typeof initialData.sessionDate === 'string'
      ? toDateInput(initialData.sessionDate)
      : '',
  );
  const [count, setCount] = useState<string>(
    initialData.count != null ? String(initialData.count) : '',
  );

  const [eventName, setEventName] = useState<string>(
    typeof initialData.name === 'string' ? initialData.name : '',
  );
  const [attendees, setAttendees] = useState<string>(
    initialData.attendees != null ? String(initialData.attendees) : '',
  );
  const [eventSummary, setEventSummary] = useState<string>(
    typeof initialData.summary === 'string' ? initialData.summary : '',
  );

  const [requestSubject, setRequestSubject] = useState<string>(
    typeof initialData.subject === 'string' ? initialData.subject : '',
  );
  const [requestStatus, setRequestStatus] = useState<RequestStatus>(
    typeof initialData.status === 'string' &&
      REQUEST_STATUSES.includes(initialData.status as RequestStatus)
      ? (initialData.status as RequestStatus)
      : 'PENDING',
  );
  const [requestBody, setRequestBody] = useState<string>(
    typeof initialData.body === 'string' ? initialData.body : '',
  );

  const [freeText, setFreeText] = useState<string>(
    typeof initialData.freeText === 'string' ? initialData.freeText : '',
  );

  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void adminGetSession()
      .then(setSession)
      .catch(() => null);
  }, []);

  // Cargar iglesias para ROOT.
  useEffect(() => {
    if (session?.account?.role !== 'ROOT') return;
    void adminGetChurches()
      .then(setChurches)
      .catch(() => setChurches([]));
  }, [session]);

  const isRoot = session?.account?.role === 'ROOT' || ctxIsRoot;

  // Preseleccionar la iglesia activa del context cuando llegue la sesión
  // (multi-iglesia: usa el selector global del sidebar).
  useEffect(() => {
    if (!churchId && !isRoot && activeChurchId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChurchId(activeChurchId);
    }
  }, [activeChurchId, churchId, isRoot]);

  const data = useMemo(() => {
    switch (reportType) {
      case 'OFFERINGS':
        return { totalCop: Number(totalCop) };
      case 'EXPENSES':
        return {
          totalCop: Number(totalCop),
          category: expenseCategory,
          description: expenseDesc.trim() || undefined,
        };
      case 'ATTENDANCE':
        return attendanceScope === 'session'
          ? {
              scope: 'session' as const,
              count: Number(count),
              sessionDate: sessionDate
                ? new Date(sessionDate).toISOString()
                : undefined,
            }
          : {
              scope: 'month' as const,
              count: Number(count),
            };
      case 'EVENT':
        return {
          name: eventName,
          attendees: attendees ? Number(attendees) : undefined,
          summary: eventSummary || undefined,
        };
      case 'REQUEST':
        return {
          subject: requestSubject.trim(),
          status: requestStatus,
          body: requestBody.trim() || undefined,
        };
      case 'OTHER':
        return { freeText };
      default:
        return {};
    }
  }, [
    reportType,
    totalCop,
    expenseCategory,
    expenseDesc,
    attendanceScope,
    sessionDate,
    count,
    eventName,
    attendees,
    eventSummary,
    requestSubject,
    requestStatus,
    requestBody,
    freeText,
  ]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!churchId) {
      setFormError('Selecciona la iglesia.');
      return;
    }
    if (!title.trim() || title.trim().length > 180) {
      setFormError('El título es obligatorio (máximo 180 caracteres).');
      return;
    }
    if (!periodStart || !periodEnd) {
      setFormError('Indica el período del informe.');
      return;
    }
    if (new Date(periodEnd) < new Date(periodStart)) {
      setFormError('La fecha final no puede ser anterior a la inicial.');
      return;
    }

    if (
      (reportType === 'OFFERINGS' || reportType === 'EXPENSES') &&
      (!Number.isFinite(Number(totalCop)) || Number(totalCop) < 0)
    ) {
      setFormError('Ingresa un monto válido (mayor o igual a 0).');
      return;
    }
    if (
      reportType === 'ATTENDANCE' &&
      (!Number.isInteger(Number(count)) || Number(count) < 0)
    ) {
      setFormError('Ingresa un número entero de asistentes (>= 0).');
      return;
    }
    if (
      reportType === 'ATTENDANCE' &&
      attendanceScope === 'session' &&
      !sessionDate
    ) {
      setFormError(
        'Indica la fecha del culto / sesión cuando reportas asistencia por culto.',
      );
      return;
    }
    if (reportType === 'EVENT' && !eventName.trim()) {
      setFormError('El nombre del evento es obligatorio.');
      return;
    }
    if (reportType === 'REQUEST' && requestSubject.trim().length < 3) {
      setFormError('El asunto de la solicitud es obligatorio (mínimo 3 caracteres).');
      return;
    }

    void onSubmit({
      churchId,
      reportType,
      title: title.trim(),
      notes: notes.trim() || undefined,
      periodStart: new Date(periodStart).toISOString(),
      periodEnd: new Date(periodEnd).toISOString(),
      data: data as Record<string, unknown>,
    });
  }

  // Lista de iglesias seleccionables: para ROOT todas; para admin, sus
  // asignaciones (multi-iglesia).
  const selectableChurches = useMemo(() => {
    if (isRoot) {
      return churches.map((c) => ({
        id: c.id,
        label: `${c.name} — ${c.city}`,
      }));
    }
    return assignments.map((a) => ({
      id: a.churchId,
      label: a.churchName ?? a.churchId,
    }));
  }, [isRoot, churches, assignments]);

  return (
    <form className={styles.formCard} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label>Tipo de informe</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
          >
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {REPORT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <span className={styles.hint}>
            {reportType === 'REQUEST'
              ? 'La solicitud queda visible para ROOT para que la apruebe o rechace.'
              : reportType === 'EXPENSES'
                ? 'Usa categoría para diferenciar compras, daños, robos o servicios.'
                : reportType === 'ATTENDANCE'
                  ? 'Puedes registrar la asistencia de un culto puntual o un acumulado mensual.'
                  : ' '}
          </span>
        </div>

        <div className={styles.field}>
          <label>Iglesia</label>
          {selectableChurches.length > 1 || isRoot ? (
            <select
              value={churchId}
              onChange={(e) => setChurchId(e.target.value)}
              required
            >
              <option value="">Selecciona…</option>
              {selectableChurches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={
                selectableChurches[0]?.label ??
                (churchId ? 'Iglesia asignada' : 'Sin iglesia asignada')
              }
              readOnly
              disabled
            />
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label>Título</label>
        <span className={styles.hint}>
          Identificador descriptivo del informe (ej. &laquo;Ofrendas enero 2026&raquo;).
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={180}
          required
        />
      </div>

      <div className={styles.formGrid}>
        <div className={styles.field}>
          <label>Período - inicio</label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label>Período - fin</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Datos específicos por tipo */}
      <div className={styles.typeSection}>
        <h3 className={styles.typeTitle}>Datos del informe</h3>

        {reportType === 'OFFERINGS' && (
          <div className={styles.field}>
            <label>Total de ofrendas (COP)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalCop}
              onChange={(e) => setTotalCop(e.target.value)}
              required
            />
          </div>
        )}

        {reportType === 'EXPENSES' && (
          <>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Total del gasto (COP)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalCop}
                  onChange={(e) => setTotalCop(e.target.value)}
                  required
                />
              </div>
              <div className={styles.field}>
                <label>Categoría</label>
                <select
                  value={expenseCategory}
                  onChange={(e) =>
                    setExpenseCategory(e.target.value as ExpenseCategory)
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label>Descripción breve (opcional)</label>
              <span className={styles.hint}>
                Cuenta qué se compró, qué se reparó o qué pasó. Máx 2000 caracteres.
              </span>
              <textarea
                rows={3}
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                maxLength={2000}
              />
            </div>
          </>
        )}

        {reportType === 'ATTENDANCE' && (
          <>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Alcance</label>
                <select
                  value={attendanceScope}
                  onChange={(e) =>
                    setAttendanceScope(e.target.value as AttendanceScope)
                  }
                >
                  <option value="month">Acumulado mensual</option>
                  <option value="session">Culto / sesión específica</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Número de asistentes</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  required
                />
              </div>
            </div>
            {attendanceScope === 'session' && (
              <div className={styles.field}>
                <label>Fecha del culto / sesión</label>
                <span className={styles.hint}>
                  Útil para distinguir culto dominical, juventud, oración, etc.
                </span>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  required
                />
              </div>
            )}
          </>
        )}

        {reportType === 'EVENT' && (
          <>
            <div className={styles.field}>
              <label>Nombre del evento</label>
              <input
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                maxLength={200}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Asistentes (opcional)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Resumen / observaciones</label>
              <textarea
                rows={3}
                value={eventSummary}
                onChange={(e) => setEventSummary(e.target.value)}
                maxLength={2000}
              />
            </div>
          </>
        )}

        {reportType === 'REQUEST' && (
          <>
            <div className={styles.field}>
              <label>Asunto de la solicitud</label>
              <span className={styles.hint}>
                Resumen claro de lo que estás pidiendo a la oficina nacional
                (ej. &laquo;Apoyo para reparación de cubierta&raquo;).
              </span>
              <input
                value={requestSubject}
                onChange={(e) => setRequestSubject(e.target.value)}
                maxLength={180}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Estado</label>
              <span className={styles.hint}>
                Inicialmente queda en &laquo;Pendiente&raquo;. ROOT podrá
                cambiarlo a aprobada, rechazada o resuelta.
              </span>
              <select
                value={requestStatus}
                onChange={(e) =>
                  setRequestStatus(e.target.value as RequestStatus)
                }
                disabled={!isRoot && Boolean(initial)}
              >
                {REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {REQUEST_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Detalle de la solicitud</label>
              <span className={styles.hint}>
                Explica con todo el contexto necesario. Máx 4000 caracteres.
              </span>
              <textarea
                rows={5}
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                maxLength={4000}
              />
            </div>
          </>
        )}

        {reportType === 'OTHER' && (
          <div className={styles.field}>
            <label>Detalle libre</label>
            <textarea
              rows={5}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              maxLength={8000}
            />
          </div>
        )}
      </div>

      <div className={styles.field}>
        <label>Notas / observaciones generales (opcional)</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
        />
      </div>

      {(formError || errorMessage) && (
        <p className={styles.formError}>{formError ?? errorMessage}</p>
      )}

      <div className={styles.formActions}>
        {onCancel && (
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={submitting}
        >
          {submitting ? 'Guardando…' : 'Guardar informe'}
        </button>
      </div>
    </form>
  );
}

/**
 * Convierte la fecha guardada al valor de un `<input type="date">`.
 *
 * Los períodos se guardan como la medianoche UTC del día calendario elegido
 * (`new Date('2026-01-15').toISOString()` produce `2026-01-15T00:00:00Z`), así
 * que hay que leerlos en UTC. Con los getters locales, en Colombia (UTC−5) ese
 * instante cae el día 14 a las 19:00 y el formulario mostraba la víspera: al
 * guardar sin tocar nada, el período retrocedía un día en cada edición.
 */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
