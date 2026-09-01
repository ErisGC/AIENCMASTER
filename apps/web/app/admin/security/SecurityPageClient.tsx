'use client';

import { useEffect, useState } from 'react';

import {
  adminApproveAccessRequest,
  adminCreateSecurityAccount,
  adminGetPendingAccessRequests,
  adminGetSecurityAccounts,
  adminGetSecurityAuditLogs,
  adminGetSecurityDevices,
  adminGetSecuritySummary,
  adminRejectAccessRequest,
  adminResetSecurityPassword,
  adminRevokeDevice,
  adminUpdateSecurityAccount,
  type AdminSecuritySummary,
  type SecurityAccessRequest,
  type SecurityAccount,
  type SecurityAuditLog,
  type SecurityDevice,
} from '@/app/lib/admin-auth';
import { formatDateTimeWithSeconds } from '@/app/lib/formatDate';
import { actionTypeLabel, roleShortLabel } from '@/app/lib/i18n';
import styles from './page.module.css';

function badgeClass(status: string) {
  switch (status) {
    case 'APPROVED':
      return `${styles.badge} ${styles.badgeApproved}`;
    case 'REJECTED':
      return `${styles.badge} ${styles.badgeRejected}`;
    case 'REVOKED':
      return `${styles.badge} ${styles.badgeRevoked}`;
    default:
      return `${styles.badge} ${styles.badgePending}`;
  }
}

export function SecurityPageClient() {
  const [summary, setSummary] = useState<AdminSecuritySummary | null>(null);
  const [requests, setRequests] = useState<SecurityAccessRequest[]>([]);
  const [devices, setDevices] = useState<SecurityDevice[]>([]);
  const [accounts, setAccounts] = useState<SecurityAccount[]>([]);
  const [logs, setLogs] = useState<SecurityAuditLog[]>([]);
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [createUsername, setCreateUsername] = useState('');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createPassword, setCreatePassword] = useState('');

  // Modales para acciones sensibles (reemplazan window.prompt)
  const [renameTarget, setRenameTarget] = useState<SecurityAccount | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [resetTarget, setResetTarget] = useState<SecurityAccount | null>(null);
  const [resetValue, setResetValue] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function fetchDashboardData() {
    return Promise.all([
      adminGetSecuritySummary(),
      adminGetPendingAccessRequests(),
      adminGetSecurityDevices(),
      adminGetSecurityAccounts(),
    ]);
  }

  async function refreshDashboard() {
    try {
      const [summaryData, requestData, deviceData, accountData] = await fetchDashboardData();
      setSummary(summaryData);
      setRequests(requestData);
      setDevices(deviceData);
      setAccounts(accountData);
      setError(null);
    } catch {
      setError('No se pudo cargar el panel de seguridad.');
    }
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [summaryData, requestData, deviceData, accountData] = await fetchDashboardData();
        if (!mounted) return;

        setSummary(summaryData);
        setRequests(requestData);
        setDevices(deviceData);
        setAccounts(accountData);
        setError(null);
      } catch {
        if (mounted) setError('No se pudo cargar el panel de seguridad.');
      }
    }

    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await adminGetSecurityAuditLogs({
          actionType: actionTypeFilter || undefined,
          actorAdminAccountId: auditActorFilter || undefined,
        });

        if (mounted) setLogs(data);
      } catch {
        if (mounted) setError('No se pudo cargar la auditoría.');
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [actionTypeFilter, auditActorFilter]);

  /**
   * Envoltura común de las acciones del panel.
   *
   * Sin ella, si aprobar o revocar fallaba (sesión caída, límite de intentos,
   * red), no se veía absolutamente nada: el administrador podía creer que
   * aprobó un dispositivo que seguía pendiente. Además la promesa quedaba
   * rechazada sin capturar.
   */
  async function ejecutarAccion(
    accion: () => Promise<unknown>,
    mensajeOk: string,
    mensajeError: string,
  ) {
    setError(null);
    try {
      await accion();
      await refreshDashboard();
      setToast(mensajeOk);
    } catch (e) {
      setError(e instanceof Error ? e.message : mensajeError);
    }
  }

  async function handleApprove(id: string) {
    await ejecutarAccion(
      () => adminApproveAccessRequest(id),
      'Dispositivo aprobado.',
      'No se pudo aprobar el dispositivo.',
    );
  }

  async function handleReject(id: string) {
    await ejecutarAccion(
      () => adminRejectAccessRequest(id),
      'Solicitud rechazada.',
      'No se pudo rechazar la solicitud.',
    );
  }

  async function handleRevoke(id: string) {
    await ejecutarAccion(
      () => adminRevokeDevice(id),
      'Dispositivo revocado.',
      'No se pudo revocar el dispositivo.',
    );
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    await ejecutarAccion(
      async () => {
        await adminCreateSecurityAccount({
          username: createUsername,
          displayName: createDisplayName,
          password: createPassword,
          role: 'ADMIN',
        });
        // Sólo se limpia el formulario si la creación salió bien: si falla,
        // lo escrito se conserva para poder corregirlo.
        setCreateUsername('');
        setCreateDisplayName('');
        setCreatePassword('');
      },
      'Cuenta creada correctamente.',
      'No se pudo crear la cuenta.',
    );
  }

  async function handleToggleAccount(account: SecurityAccount) {
    await ejecutarAccion(
      () =>
        adminUpdateSecurityAccount(account.id, {
          isActive: !account.isActive,
        }),
      account.isActive ? 'Cuenta desactivada.' : 'Cuenta reactivada.',
      'No se pudo cambiar el estado de la cuenta.',
    );
  }

  function openRenameModal(account: SecurityAccount) {
    setRenameTarget(account);
    setRenameValue(account.displayName);
    setModalError(null);
  }

  async function submitRenameAccount() {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      setModalError('El nombre debe tener entre 2 y 100 caracteres.');
      return;
    }
    try {
      await adminUpdateSecurityAccount(renameTarget.id, {
        displayName: trimmed,
      });
      setRenameTarget(null);
      setRenameValue('');
      setModalError(null);
      setToast('Nombre actualizado correctamente.');
      await refreshDashboard();
    } catch {
      setModalError('No se pudo actualizar el nombre.');
    }
  }

  function openResetPasswordModal(account: SecurityAccount) {
    setResetTarget(account);
    setResetValue('');
    setResetConfirm('');
    setModalError(null);
  }

  async function submitResetPassword() {
    if (!resetTarget) return;
    if (resetValue.length < 8) {
      setModalError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (resetValue !== resetConfirm) {
      setModalError('Las contraseñas no coinciden.');
      return;
    }
    try {
      await adminResetSecurityPassword(resetTarget.id, resetValue);
      setResetTarget(null);
      setResetValue('');
      setResetConfirm('');
      setModalError(null);
      setToast('Contraseña restablecida correctamente.');
    } catch {
      setModalError('No se pudo restablecer la contraseña.');
    }
  }

  // Dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Seguridad administrativa</h1>
          <p className={styles.subtitle}>
            Este módulo sólo está disponible para la cuenta root desde el root device.
          </p>
        </div>
        <div className={styles.headerActions}>
          <a href="/admin/site" className={styles.headerCTASecondary}>
            Fondos del portal
          </a>
          <a href="/admin/security/invitations" className={styles.headerCTA}>
            Invitar nuevo administrador →
          </a>
        </div>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Administradores</span>
          <strong className={styles.summaryValue}>{summary?.adminAccounts ?? 0}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Dispositivos aprobados</span>
          <strong className={styles.summaryValue}>{summary?.approvedDevices ?? 0}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Solicitudes pendientes</span>
          <strong className={styles.summaryValue}>{summary?.pendingRequests ?? 0}</strong>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Revocados recientes</span>
          <strong className={styles.summaryValue}>
            {summary?.recentRevokedDevices.length ?? 0}
          </strong>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Solicitudes pendientes</h2>
            <p className={styles.sectionHint}>
              Se actualizan automáticamente para permitir aprobación desde el root device.
            </p>
          </div>
        </div>

        <div className={styles.stack}>
          {requests.length === 0 ? (
            <p className={styles.empty}>No hay solicitudes pendientes.</p>
          ) : (
            requests.map((request) => (
              <article key={request.id} className={styles.requestCard}>
                <div className={styles.row}>
                  <div>
                    <p className={styles.titleLine}>
                      {request.deviceName}{' '}
                      <span className={badgeClass(request.status)}>{request.status}</span>
                    </p>
                    <div className={styles.meta}>
                      <span>{request.adminAccount?.displayName ?? request.requestedUsername}</span>
                      <span>{request.browser}</span>
                      <span>{request.platform}</span>
                      <span>{request.ip ?? 'Sin IP'}</span>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void handleApprove(request.id)}
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => void handleReject(request.id)}
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Dispositivos autorizados</h2>
            <p className={styles.sectionHint}>
              El root device no puede revocarse desde este panel.
            </p>
          </div>
        </div>

        <div className={styles.stack}>
          {devices.map((device) => (
            <article key={device.id} className={styles.deviceCard}>
              <div className={styles.row}>
                <div>
                  <p className={styles.titleLine}>
                    {device.deviceName}{' '}
                    <span className={badgeClass(device.status)}>{device.status}</span>
                  </p>
                  <div className={styles.meta}>
                    <span>{device.adminAccount?.displayName ?? 'Sin cuenta'}</span>
                    <span>{device.browser}</span>
                    <span>{device.platform}</span>
                    <span>{device.roleScope}</span>
                    <span>
                      Última actividad:{' '}
                      {device.lastSeenAt
                        ? formatDateTimeWithSeconds(device.lastSeenAt)
                        : 'Nunca'}
                    </span>
                  </div>
                </div>

                {device.roleScope !== 'ROOT_DEVICE' && (
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    onClick={() => void handleRevoke(device.id)}
                  >
                    Revocar
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Cuentas admin</h2>
            <p className={styles.sectionHint}>
              El bootstrap crea el root. Desde aquí se gestionan cuentas secundarias.
            </p>
          </div>
        </div>

        <form className={styles.formGrid} onSubmit={handleCreateAccount}>
          <div className={styles.field}>
            <label>Usuario</label>
            <input
              value={createUsername}
              onChange={(e) => setCreateUsername(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Nombre visible</label>
            <input
              value={createDisplayName}
              onChange={(e) => setCreateDisplayName(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Contraseña temporal</label>
            <input
              type="password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Acción</label>
            <button type="submit" className={styles.primaryBtn}>
              Crear ADMIN
            </button>
          </div>
        </form>

        <div className={styles.stack}>
          {accounts.map((account) => (
            <article key={account.id} className={styles.accountCard}>
              <div className={styles.row}>
                <div>
                  <p className={styles.titleLine}>
                    {account.displayName}{' '}
                    <span
                      className={badgeClass(account.isActive ? 'APPROVED' : 'REJECTED')}
                    >
                      {roleShortLabel(account.role)}
                    </span>
                  </p>
                  <div className={styles.meta}>
                    <span>@{account.username}</span>
                    <span>{account.isActive ? 'Activa' : 'Inactiva'}</span>
                    <span>Dispositivos: {account.devices.length}</span>
                  </div>
                </div>

                <div className={styles.actions}>
                  <a
                    href={`/admin/security/accounts/${account.id}`}
                    className={styles.inlineBtn}
                  >
                    Ver historial
                  </a>
                  <button
                    type="button"
                    className={styles.inlineBtn}
                    onClick={() => openRenameModal(account)}
                  >
                    Editar nombre
                  </button>
                  {account.role !== 'ROOT' && (
                    <button
                      type="button"
                      className={styles.inlineBtn}
                      onClick={() => void handleToggleAccount(account)}
                    >
                      {account.isActive ? 'Desactivar' : 'Reactivar'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => openResetPasswordModal(account)}
                  >
                    Resetear contraseña
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>Auditoría</h2>
            <p className={styles.sectionHint}>
              Registra autenticación, solicitudes, cuentas y acciones sobre contenido.
            </p>
          </div>
        </div>

        <div className={styles.logFilters}>
          <input
            placeholder="Filtrar por tipo de acción"
            value={actionTypeFilter}
            onChange={(e) => setActionTypeFilter(e.target.value)}
          />
          <select
            value={auditActorFilter}
            onChange={(e) => setAuditActorFilter(e.target.value)}
          >
            <option value="">Todos los actores</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.stack}>
          {logs.map((log) => (
            <article key={log.id} className={styles.logCard}>
              <div className={styles.row}>
                <div>
                  <p className={styles.titleLine}>{log.description}</p>
                  <div className={styles.meta}>
                    <span>{actionTypeLabel(log.actionType)}</span>
                    <span>{log.targetType}</span>
                    <span>{log.actorAdminAccount?.displayName ?? 'Sistema'}</span>
                    <span>{formatDateTimeWithSeconds(log.createdAt)}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <div className={styles.toast} role="status">
          <span>{toast}</span>
          <button
            type="button"
            className={styles.toastClose}
            onClick={() => setToast(null)}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {/* Rename modal */}
      {renameTarget && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-title"
        >
          <div className={styles.modalCard}>
            <h3 id="rename-title" className={styles.modalTitle}>
              Renombrar cuenta
            </h3>
            <p className={styles.modalText}>
              Nuevo nombre visible para <strong>@{renameTarget.username}</strong>
            </p>
            <input
              className={styles.modalInput}
              type="text"
              value={renameValue}
              maxLength={100}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
            />
            {modalError && <p className={styles.modalError}>{modalError}</p>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => {
                  setRenameTarget(null);
                  setRenameValue('');
                  setModalError(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => void submitRenameAccount()}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetTarget && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
        >
          <div className={styles.modalCard}>
            <h3 id="reset-title" className={styles.modalTitle}>
              Restablecer contraseña
            </h3>
            <p className={styles.modalText}>
              Cuenta: <strong>@{resetTarget.username}</strong>
            </p>
            <input
              className={styles.modalInput}
              type="password"
              placeholder="Nueva contraseña (mín. 8)"
              value={resetValue}
              maxLength={128}
              minLength={8}
              onChange={(e) => setResetValue(e.target.value)}
              autoFocus
              autoComplete="new-password"
            />
            <input
              className={styles.modalInput}
              type="password"
              placeholder="Confirmar contraseña"
              value={resetConfirm}
              maxLength={128}
              onChange={(e) => setResetConfirm(e.target.value)}
              autoComplete="new-password"
            />
            {modalError && <p className={styles.modalError}>{modalError}</p>}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => {
                  setResetTarget(null);
                  setResetValue('');
                  setResetConfirm('');
                  setModalError(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => void submitResetPassword()}
              >
                Restablecer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
