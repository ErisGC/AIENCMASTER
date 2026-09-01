'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { adminGetChurches, type Church } from '@/app/lib/admin-churches';
import {
  adminGetAccountHistory,
  adminGetSession,
  type AccountHistoryResponse,
} from '@/app/lib/admin-auth';
import {
  adminAssignChurch,
  adminGetPermissionsCatalog,
  adminRemoveChurchAssignment,
  adminUpdateChurchPermissions,
  adminUpdateGlobalPermissions,
  type ChurchPermission,
  type GlobalPermission,
  type PermissionsCatalogResponse,
} from '@/app/lib/admin-permissions';
import { roleLabel } from '@/app/lib/i18n';

import styles from './page.module.css';

interface Props {
  accountId: string;
}

export function PermissionsPageClient({ accountId }: Props) {
  const [data, setData] = useState<AccountHistoryResponse | null>(null);
  const [catalog, setCatalog] = useState<PermissionsCatalogResponse | null>(
    null,
  );
  const [churches, setChurches] = useState<Church[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingChurch, setSavingChurch] = useState<string | null>(null);
  const [actorAccountId, setActorAccountId] = useState<string | null>(null);

  // Estado local de los permisos globales (editable antes de guardar)
  const [draftGlobal, setDraftGlobal] = useState<GlobalPermission[]>([]);

  // Estado de la modal de "Asignar iglesia"
  const [showAssign, setShowAssign] = useState(false);
  const [assignChurchId, setAssignChurchId] = useState('');
  const [assignTemplate, setAssignTemplate] = useState('PASTOR');
  const [assignPermissions, setAssignPermissions] = useState<ChurchPermission[]>(
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const [account, cat, churchList] = await Promise.all([
        adminGetAccountHistory(accountId),
        adminGetPermissionsCatalog(),
        adminGetChurches(),
      ]);
      setData(account);
      setCatalog(cat);
      setChurches(churchList);
      setDraftGlobal(account.account.globalPermissions ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el panel de permisos.',
      );
    }
  }, [accountId]);

  useEffect(() => {
    void refresh();
    void adminGetSession()
      .then((s) => setActorAccountId(s.account?.id ?? null))
      .catch(() => setActorAccountId(null));
  }, [refresh]);

  const isSelf = data?.account.id === actorAccountId;

  const isRoot = data?.account.role === 'ROOT';

  const globalDescriptors = useMemo(
    () => catalog?.catalog.filter((c) => c.group === 'global') ?? [],
    [catalog],
  );
  const churchDescriptors = useMemo(
    () => catalog?.catalog.filter((c) => c.group === 'church') ?? [],
    [catalog],
  );

  // Iglesias disponibles para asignar (las que aún no están asignadas)
  const availableChurchesToAssign = useMemo(() => {
    const assignedIds = new Set(
      data?.account.churchAssignments?.map((a) => a.churchId) ?? [],
    );
    return churches.filter((c) => !assignedIds.has(c.id));
  }, [churches, data]);

  function toggleGlobal(p: GlobalPermission) {
    setDraftGlobal((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function saveGlobal() {
    setSavingGlobal(true);
    try {
      await adminUpdateGlobalPermissions(accountId, draftGlobal);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar los permisos globales.',
      );
    } finally {
      setSavingGlobal(false);
    }
  }

  function openAssignModal() {
    setAssignChurchId('');
    setAssignTemplate('PASTOR');
    const tpl = catalog?.templates.find((t) => t.key === 'PASTOR');
    setAssignPermissions(tpl?.churchPermissions ?? []);
    setShowAssign(true);
  }

  function applyTemplate(templateKey: string) {
    setAssignTemplate(templateKey);
    const tpl = catalog?.templates.find((t) => t.key === templateKey);
    setAssignPermissions(tpl?.churchPermissions ?? []);
  }

  function toggleAssignPermission(p: ChurchPermission) {
    setAssignTemplate('CUSTOM');
    setAssignPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function submitAssign() {
    if (!assignChurchId) return;
    setSavingChurch(assignChurchId);
    try {
      await adminAssignChurch(accountId, assignChurchId, assignPermissions);
      setShowAssign(false);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo asignar la iglesia.',
      );
    } finally {
      setSavingChurch(null);
    }
  }

  async function toggleChurchPermission(
    churchId: string,
    p: ChurchPermission,
    currentPermissions: ChurchPermission[],
  ) {
    const updated = currentPermissions.includes(p)
      ? currentPermissions.filter((x) => x !== p)
      : [...currentPermissions, p];
    setSavingChurch(churchId);
    try {
      await adminUpdateChurchPermissions(accountId, churchId, updated);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo actualizar el permiso.',
      );
    } finally {
      setSavingChurch(null);
    }
  }

  async function removeAssignment(churchId: string) {
    if (!window.confirm('¿Quitar la asignación de esta iglesia al admin?')) {
      return;
    }
    setSavingChurch(churchId);
    try {
      await adminRemoveChurchAssignment(accountId, churchId);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo retirar la asignación.',
      );
    } finally {
      setSavingChurch(null);
    }
  }

  if (error && !data) {
    return (
      <main className={styles.page}>
        <Link href="/admin/security" className={styles.backLink}>
          ← Volver a Seguridad
        </Link>
        <div className={styles.errorBanner}>{error}</div>
      </main>
    );
  }

  if (!data || !catalog) {
    return (
      <main className={styles.page}>
        <p className={styles.loading}>Cargando…</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <Link href={`/admin/security/accounts/${accountId}`} className={styles.backLink}>
        ← Volver al historial
      </Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Permisos de {data.account.displayName}</h1>
          <p className={styles.subtitle}>
            @{data.account.username} · {roleLabel(data.account.role)}
          </p>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <section className={styles.roleSection}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Rol de la cuenta</h2>
          <p className={styles.sectionSubtitle}>
            {isRoot
              ? 'Esta cuenta es administrador principal. Puedes degradarla a administrador normal si dejas al menos otra cuenta ROOT activa.'
              : 'Esta cuenta es administrador normal de iglesias. Puedes promoverla a administrador principal (ROOT) para que tenga acceso total al sistema.'}
          </p>
        </div>
        <div className={styles.roleRow}>
          <div className={styles.roleCurrent}>
            <span className={styles.roleLabel}>Rol actual</span>
            <span
              className={isRoot ? styles.roleBadgeRoot : styles.roleBadgeAdmin}
            >
              {isRoot ? 'Administrador principal' : 'Administrador'}
            </span>
          </div>
          {/*
            Aquí había botones para promover y degradar. El sistema admite una
            sola cuenta principal —lo garantiza un índice en la base de datos y
            una comprobación al arrancar—, así que ninguna de las dos
            operaciones podía completarse: tras dos confirmaciones en pantalla,
            el servidor devolvía un error sin explicación. Se retiran los
            botones y se dice lo que sí se puede hacer.
          */}
          <span className={styles.roleSelfHint}>
            {isSelf
              ? 'Esta es tu propia cuenta.'
              : 'El rol de una cuenta no se cambia desde aquí.'}
          </span>
        </div>
        <p className={styles.roleFootnote}>
          El sistema admite una sola cuenta de administrador principal, y por
          eso su rol no se puede intercambiar entre cuentas. Para pasar esa
          cuenta a otra persona se usa la recuperación de acceso del
          administrador principal. Lo que sí se ajusta desde esta pantalla son
          los permisos y las iglesias asignadas.
        </p>
      </section>

      {isRoot ? (
        <div className={styles.rootNotice}>
          <strong>Esta es la cuenta principal del sistema.</strong> Tiene todos
          los permisos globales y sobre todas las iglesias por defecto. Los
          permisos no se editan aquí — la cuenta principal es el control total.
        </div>
      ) : (
        <>
          {/* Permisos globales */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Permisos globales</h2>
              <p className={styles.sectionSubtitle}>
                Aplican sobre toda la plataforma. Marca los que quieres delegarle
                a esta cuenta. Vacío = sin permisos globales (sólo opera sobre
                iglesias asignadas).
              </p>
            </div>

            <ul className={styles.permList}>
              {globalDescriptors.map((d) => (
                <li key={d.key} className={styles.permItem}>
                  <label className={styles.permLabel}>
                    <input
                      type="checkbox"
                      checked={draftGlobal.includes(d.key as GlobalPermission)}
                      onChange={() => toggleGlobal(d.key as GlobalPermission)}
                    />
                    <span>
                      <strong>{d.label}</strong>
                      <span className={styles.permDesc}>{d.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className={styles.sectionFooter}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => void saveGlobal()}
                disabled={savingGlobal}
              >
                {savingGlobal ? 'Guardando…' : 'Guardar permisos globales'}
              </button>
            </div>
          </section>

          {/* Asignaciones por iglesia */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Iglesias asignadas</h2>
              <p className={styles.sectionSubtitle}>
                Cada asignación define qué puede hacer el admin sobre esa
                iglesia en particular. Puedes asignar varias iglesias con
                permisos distintos en cada una.
              </p>
            </div>

            {data.account.churchAssignments.length === 0 ? (
              <div className={styles.emptyState}>
                Este admin no tiene iglesias asignadas todavía.
              </div>
            ) : (
              <div className={styles.assignmentList}>
                {data.account.churchAssignments.map((a) => (
                  <div key={a.id} className={styles.assignmentCard}>
                    <div className={styles.assignmentHead}>
                      <strong className={styles.churchName}>
                        {a.churchName ?? a.churchId.slice(0, 8)}
                      </strong>
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => void removeAssignment(a.churchId)}
                        disabled={savingChurch === a.churchId}
                      >
                        Quitar
                      </button>
                    </div>

                    <ul className={styles.permList}>
                      {churchDescriptors.map((d) => (
                        <li key={d.key} className={styles.permItem}>
                          <label className={styles.permLabel}>
                            <input
                              type="checkbox"
                              checked={a.permissions.includes(
                                d.key as ChurchPermission,
                              )}
                              disabled={savingChurch === a.churchId}
                              onChange={() =>
                                void toggleChurchPermission(
                                  a.churchId,
                                  d.key as ChurchPermission,
                                  a.permissions,
                                )
                              }
                            />
                            <span>
                              <strong>{d.label}</strong>
                              <span className={styles.permDesc}>
                                {d.description}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {availableChurchesToAssign.length > 0 && (
              <div className={styles.sectionFooter}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={openAssignModal}
                >
                  + Asignar otra iglesia
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal asignar iglesia */}
      {showAssign && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assign-title"
        >
          <div className={styles.modalCard}>
            <h3 id="assign-title" className={styles.modalTitle}>
              Asignar iglesia
            </h3>
            <p className={styles.modalText}>
              Elige la iglesia y un preset de permisos. Puedes ajustar los
              permisos manualmente desde &quot;Personalizado&quot;.
            </p>

            <div className={styles.field}>
              <label>Iglesia</label>
              <select
                value={assignChurchId}
                onChange={(e) => setAssignChurchId(e.target.value)}
              >
                <option value="">Selecciona…</option>
                {availableChurchesToAssign.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.city}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label>Preset de permisos</label>
              <div className={styles.templateGrid}>
                {catalog.templates.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    className={`${styles.templateBtn} ${assignTemplate === tpl.key ? styles.templateBtnActive : ''}`}
                    onClick={() => applyTemplate(tpl.key)}
                  >
                    <strong>{tpl.name}</strong>
                    <span>{tpl.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label>Permisos efectivos sobre esta iglesia</label>
              <ul className={styles.permList}>
                {churchDescriptors.map((d) => (
                  <li key={d.key} className={styles.permItem}>
                    <label className={styles.permLabel}>
                      <input
                        type="checkbox"
                        checked={assignPermissions.includes(
                          d.key as ChurchPermission,
                        )}
                        onChange={() =>
                          toggleAssignPermission(d.key as ChurchPermission)
                        }
                      />
                      <span>
                        <strong>{d.label}</strong>
                        <span className={styles.permDesc}>{d.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowAssign(false)}
                disabled={!!savingChurch}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => void submitAssign()}
                disabled={!assignChurchId || !!savingChurch}
              >
                {savingChurch ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
