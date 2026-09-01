'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { formatDateTimeWithSeconds } from '@/app/lib/formatDate';
import {
  Announcement,
  adminDeleteAnnouncement,
  adminGetAnnouncements,
} from '@/app/lib/admin-announcements';
import styles from './page.module.css';

export function AdminAnnouncementsPageClient() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // El temporizador anterior se cancela antes de armar el nuevo: dos avisos
  // seguidos hacían que el primero borrara el segundo casi al instante.
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const data = await adminGetAnnouncements();
      setAnnouncements(data);
      setLoadError(null);
    } catch {
      setLoadError('No se pudo cargar la lista de anuncios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setConfirmDeleteId(null);

    try {
      await adminDeleteAnnouncement(id);
      showToast('Anuncio eliminado correctamente.', 'success');
      await loadAnnouncements();
    } catch {
      showToast('Error eliminando el anuncio.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <main className={styles.container}>
        <div className={styles.skeletonHeader} />
        <div className={styles.skeletonTable}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow} />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      {/* Toast notification */}
      {toast && (
        <div className={`${styles.toast} ${styles[toast.type]}`}>
          {toast.message}
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

      {/* Confirm dialog */}
      {confirmDeleteId && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>Confirmar eliminación</h3>
            <p className={styles.dialogText}>
              ¿Está seguro que quiere eliminar este anuncio? Esta acción no se puede deshacer.
            </p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.dialogCancel}
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.dialogConfirm}
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className={styles.header}>
        <h1>Anuncios</h1>
        <Link href="/admin/announcements/new" className={styles.newButton}>
          Nuevo anuncio
        </Link>
      </header>

      {loadError && (
        <div className={styles.errorBanner}>
          <span>{loadError}</span>
          <button type="button" className={styles.retryButton} onClick={() => { setLoading(true); void loadAnnouncements(); }}>
            Reintentar
          </button>
        </div>
      )}

      {!loadError && announcements.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No hay anuncios creados todavía.</p>
          <Link href="/admin/announcements/new" className={styles.newButton}>
            Crear el primero
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Autor</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {announcements.map((a) => (
                <tr key={a.id}>
                  <td className={styles.title}>{a.title}</td>
                  <td>{a.author}</td>
                  <td>{formatDateTimeWithSeconds(a.createdAt)}</td>
                  <td className={styles.actions}>
                    <Link
                      href={`/admin/announcements/${a.id}/edit`}
                      className={styles.editLink}
                    >
                      Editar
                    </Link>

                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => setConfirmDeleteId(a.id)}
                      disabled={deletingId === a.id}
                    >
                      {deletingId === a.id ? 'Eliminando…' : 'Eliminar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
