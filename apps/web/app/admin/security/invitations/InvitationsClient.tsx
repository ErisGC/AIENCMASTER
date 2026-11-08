'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  adminCreateInvitation,
  adminListInvitations,
  adminRevokeInvitation,
  type AdminInvitationCreated,
  type AdminInvitationSummary,
} from '@/app/lib/admin-invitations';
import { adminGetChurches, type Church } from '@/app/lib/admin-churches';
import {
  adminGetPermissionsCatalog,
  type ChurchPermission,
  type PermissionsCatalogResponse,
} from '@/app/lib/admin-permissions';
import { formatDateTimeWithSeconds } from '@/app/lib/formatDate';
import { invitationStatusLabel } from '@/app/lib/i18n';

import styles from './page.module.css';

export function InvitationsClient() {
  const [invitations, setInvitations] = useState<AdminInvitationSummary[]>([]);
  const [churches, setChurches] = useState<Church[]>([]);
  const [catalog, setCatalog] = useState<PermissionsCatalogResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formChurchId, setFormChurchId] = useState('');
  const [formTemplate, setFormTemplate] = useState('PASTOR');
  const [formPermissions, setFormPermissions] = useState<ChurchPermission[]>(
    [],
  );
  // La plataforma admite una sola cuenta principal y la API rechaza invitar
  // otra, así que aquí solo se invitan administradores de iglesia.
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<{
    url: string;
    invitation: AdminInvitationCreated;
  } | null>(null);
  // Estado del botón Copiar: el enlace no se vuelve a mostrar, así que hay
  // que confirmar que de verdad quedó copiado.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const refresh = useCallback(async () => {
    try {
      const [list, churchList, cat] = await Promise.all([
        adminListInvitations(),
        adminGetChurches(),
        adminGetPermissionsCatalog(),
      ]);
      setInvitations(list);
      setChurches(churchList);
      setCatalog(cat);
      // Inicializar template "Pastor" si no hay nada elegido
      if (formPermissions.length === 0) {
        const pastor = cat.templates.find((t) => t.key === 'PASTOR');
        if (pastor) setFormPermissions(pastor.churchPermissions);
      }
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el panel de invitaciones.',
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTemplate(templateKey: string) {
    setFormTemplate(templateKey);
    const tpl = catalog?.templates.find((t) => t.key === templateKey);
    if (tpl) setFormPermissions(tpl.churchPermissions);
  }

  function togglePermission(p: ChurchPermission) {
    setFormTemplate('CUSTOM');
    setFormPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const username = formUsername.trim();
    const displayName = formDisplayName.trim();
    if (!/^[a-zA-Z0-9_.-]+$/.test(username) || username.length < 3 || username.length > 50) {
      setFormError('Usuario inválido (3–50 caracteres, sin espacios).');
      return;
    }
    if (displayName.length < 2 || displayName.length > 100) {
      setFormError('Nombre visible inválido (2–100 caracteres).');
      return;
    }
    if (!formChurchId) {
      setFormError('Selecciona la iglesia que el admin podrá administrar.');
      return;
    }

    setSubmitting(true);
    try {
      const inv = await adminCreateInvitation({
        username,
        displayName,
        assignedChurchId: formChurchId,
        churchPermissions: formPermissions,
      });
      const url = `${window.location.origin}/admin/invite/${encodeURIComponent(inv.token)}`;
      setCreatedLink({ url, invitation: inv });
      setCopyState('idle');
      setFormUsername('');
      setFormDisplayName('');
      setFormChurchId('');
      // Reset al template Pastor para la próxima invitación
      const pastor = catalog?.templates.find((t) => t.key === 'PASTOR');
      if (pastor) {
        setFormTemplate('PASTOR');
        setFormPermissions(pastor.churchPermissions);
      }
      await refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo crear la invitación.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    if (
      !window.confirm(
        '¿Revocar esta invitación? El link dejará de funcionar inmediatamente.',
      )
    )
      return;
    try {
      await adminRevokeInvitation(id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo revocar la invitación.',
      );
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      // Sin permiso para el portapapeles: el enlace sigue a la vista para
      // copiarlo a mano.
      setCopyState('failed');
    }
  }

  function closeCreatedLink() {
    if (
      copyState !== 'copied' &&
      !window.confirm(
        'Este enlace no se volverá a mostrar. ¿Ya lo copiaste o lo compartiste?',
      )
    ) {
      return;
    }
    setCreatedLink(null);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/admin/security" className={styles.backLink}>
            ← Volver a Seguridad
          </Link>
          <h1 className={styles.title}>Invitaciones de administradores</h1>
          <p className={styles.subtitle}>
            Crea un link único para que un nuevo administrador active su cuenta.
            La invitación define el usuario y la iglesia que podrá gestionar.
          </p>
        </div>
      </header>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <section className={styles.formCard}>
        <h2 className={styles.sectionTitle}>Nueva invitación</h2>
        <form onSubmit={handleCreate} className={styles.form}>
          <div className={styles.row}>
            <div className={styles.field}>
              <label>Usuario</label>
              <span className={styles.hint}>
                Sólo letras, números, &quot;_&quot;, &quot;.&quot; y &quot;-&quot;. Ejemplo: pastor.juan
              </span>
              <input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                placeholder="pastor.juan"
                maxLength={50}
                required
              />
            </div>

            <div className={styles.field}>
              <label>Nombre visible</label>
              <span className={styles.hint}>
                Como aparecerá en el panel y en los informes que genere.
              </span>
              <input
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder="Pastor Juan Pérez"
                maxLength={100}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>Iglesia asignada</label>
            <span className={styles.hint}>
              El admin sólo podrá gestionar datos y subir informes de la
              iglesia que selecciones. Después podrás asignarle más iglesias
              desde el panel de permisos.
            </span>
            <select
              value={formChurchId}
              onChange={(e) => setFormChurchId(e.target.value)}
              required
            >
              <option value="">Selecciona una iglesia…</option>
              {churches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.city}
                </option>
              ))}
            </select>
          </div>

          {catalog && (
            <>
              <div className={styles.field}>
                <label>Rol que va a tener</label>
                <span className={styles.hint}>
                  Cada preset deja explícito qué permisos marca. Si ninguno
                  encaja, selecciona &quot;Personalizado&quot; y márcalos uno
                  a uno.
                </span>
                <div className={styles.templateGrid}>
                  {catalog.templates.map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      className={`${styles.templateBtn} ${formTemplate === tpl.key ? styles.templateBtnActive : ''}`}
                      onClick={() => applyTemplate(tpl.key)}
                    >
                      <strong>{tpl.name}</strong>
                      <span>{tpl.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label>Permisos efectivos sobre la iglesia</label>
                <ul className={styles.permList}>
                  {catalog.catalog
                    .filter((c) => c.group === 'church')
                    .map((d) => (
                      <li key={d.key} className={styles.permItem}>
                        <label className={styles.permLabel}>
                          <input
                            type="checkbox"
                            checked={formPermissions.includes(
                              d.key as ChurchPermission,
                            )}
                            onChange={() =>
                              togglePermission(d.key as ChurchPermission)
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
            </>
          )}

          {formError && <p className={styles.formError}>{formError}</p>}

          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={submitting}
            >
              {submitting ? 'Generando…' : 'Generar link de invitación'}
            </button>
          </div>
        </form>

        {createdLink && (
          <div className={styles.linkBox}>
            <div className={styles.linkBoxHead}>
              <strong>Link generado para @{createdLink.invitation.username}</strong>
              <button
                type="button"
                className={styles.linkClose}
                onClick={closeCreatedLink}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <p className={styles.linkBoxText}>
              Comparte este link con la persona invitada. Es válido por 72
              horas y solo puede usarse una vez. <strong>No volverá a mostrarse</strong>.
            </p>
            <div className={styles.linkRow}>
              <code className={styles.linkCode}>{createdLink.url}</code>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => void copyLink(createdLink.url)}
              >
                {copyState === 'copied' ? 'Copiado ✓' : 'Copiar'}
              </button>
            </div>
            {copyState === 'failed' && (
              <p className={styles.linkBoxText} role="status">
                No se pudo copiar automáticamente. Selecciona el enlace y
                cópialo a mano.
              </p>
            )}
          </div>
        )}
      </section>

      <section className={styles.listCard}>
        <h2 className={styles.sectionTitle}>Invitaciones existentes</h2>

        {loading ? (
          <p>Cargando…</p>
        ) : invitations.length === 0 ? (
          <p className={styles.empty}>Aún no se ha generado ninguna invitación.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Iglesia</th>
                  <th>Estado</th>
                  <th>Expira</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td>@{inv.username}</td>
                    <td>{inv.displayName}</td>
                    <td>
                      <span
                        className={
                          inv.targetRole === 'ROOT'
                            ? styles.badgeRoot
                            : styles.badgeAdmin
                        }
                      >
                        {inv.targetRole === 'ROOT' ? 'Principal' : 'Admin'}
                      </span>
                    </td>
                    <td>
                      {inv.targetRole === 'ROOT'
                        ? '—'
                        : inv.assignedChurchName ?? '—'}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${inv.status}`]}`}>
                        {invitationStatusLabel(inv.status)}
                      </span>
                    </td>
                    <td>{formatDateTimeWithSeconds(inv.expiresAt)}</td>
                    <td className={styles.cellActions}>
                      {inv.status === 'PENDING' && (
                        <button
                          type="button"
                          className={styles.dangerBtn}
                          onClick={() => void handleRevoke(inv.id)}
                        >
                          Revocar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
