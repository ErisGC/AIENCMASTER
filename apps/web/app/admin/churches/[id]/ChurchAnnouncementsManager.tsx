'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  adminCreateChurchAnnouncement,
  adminDeleteChurchAnnouncement,
  adminListChurchAnnouncements,
  adminUpdateChurchAnnouncement,
  type ChurchAnnouncementSummary,
} from '@/app/lib/admin-church-announcements';
import { formatDateTimeWithSeconds } from '@/app/lib/formatDate';

import styles from './ChurchAnnouncementsManager.module.css';

interface Props {
  churchId: string;
}

/**
 * Gestor de anuncios específicos de una iglesia.
 *
 * - El pastor/admin con permiso `MANAGE_CHURCH_ANNOUNCEMENTS` puede crear,
 *   editar y eliminar anuncios visibles en la página pública de la iglesia.
 * - Es independiente de los anuncios globales (que sólo ROOT controla).
 */
export function ChurchAnnouncementsManager({ churchId }: Props) {
  const [items, setItems] = useState<ChurchAnnouncementSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Si la lista no cargó, no se dice "aún no hay": se ofrece reintentar.
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await adminListChurchAnnouncements(churchId);
      setItems(list);
      setError(null);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los anuncios de la iglesia.',
      );
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resetCreate() {
    setTitle('');
    setDescription('');
    setAuthor('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!title.trim() || !description.trim() || !author.trim()) {
      setError('Título, descripción y autor son obligatorios.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('title', title.trim());
      form.append('description', description.trim());
      form.append('author', author.trim());
      files.forEach((f) => form.append('attachments', f));
      await adminCreateChurchAnnouncement(churchId, form);
      resetCreate();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo crear el anuncio.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item: ChurchAnnouncementSummary) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditAuthor(item.author);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
    setEditDescription('');
    setEditAuthor('');
  }

  async function saveEdit() {
    if (!editingId || savingEdit) return;
    setSavingEdit(true);
    setError(null);
    try {
      await adminUpdateChurchAnnouncement(churchId, editingId, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        author: editAuthor.trim(),
      });
      cancelEdit();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo guardar el anuncio.',
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(item: ChurchAnnouncementSummary) {
    if (!window.confirm(`¿Eliminar el anuncio "${item.title}"?`)) return;
    try {
      await adminDeleteChurchAnnouncement(churchId, item.id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar el anuncio.',
      );
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
  }

  return (
    <section className={`${styles.section} ${styles.card}`}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Anuncios de esta iglesia</h2>
          <p className={styles.subtitle}>
            Estos anuncios sólo se muestran en la página pública de la iglesia.
            Puedes adjuntar imágenes o PDFs (programas, devocionales, fotos).
          </p>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.form} onSubmit={handleCreate}>
        <div className={styles.row}>
          <div className={styles.field}>
            <label>Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={180}
              required
            />
          </div>
          <div className={styles.field}>
            <label>Autor (pastor / equipo)</label>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              maxLength={100}
              required
            />
          </div>
        </div>
        <div className={styles.field}>
          <label>Descripción</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={4}
            required
          />
        </div>
        <div className={styles.fileRow}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={handleFilePick}
          />
          {files.length > 0 && (
            <span className={styles.fileChip}>
              {files.length} archivo{files.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className={styles.actions}>
          {(title || description || author || files.length > 0) && (
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={resetCreate}
            >
              Limpiar
            </button>
          )}
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={submitting}
          >
            {submitting ? 'Publicando…' : 'Publicar anuncio'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className={styles.empty}>Cargando anuncios…</p>
      ) : loadFailed ? (
        <p className={styles.empty}>
          No se pudo cargar la lista.{' '}
          <button type="button" className={styles.retryInline} onClick={() => void refresh()}>
            Reintentar
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>
          Aún no hay anuncios publicados para esta iglesia.
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((it) => (
            <li
              key={it.id}
              id={`anuncio-${it.id}`}
              className={styles.item}
            >
              {editingId === it.id ? (
                <>
                  <div className={styles.row}>
                    <div className={styles.field}>
                      <label>Título</label>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={180}
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Autor</label>
                      <input
                        value={editAuthor}
                        onChange={(e) => setEditAuthor(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Descripción</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      maxLength={4000}
                      rows={4}
                    />
                  </div>
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={cancelEdit}
                      disabled={savingEdit}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void saveEdit()}
                      disabled={savingEdit}
                    >
                      {savingEdit ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.itemHead}>
                    <h3 className={styles.itemTitle}>{it.title}</h3>
                    <span className={styles.itemMeta}>
                      {formatDateTimeWithSeconds(it.createdAt)}
                    </span>
                  </div>
                  <p className={styles.itemMeta}>
                    Por <strong>{it.author}</strong>
                  </p>
                  <p className={styles.itemDesc}>{it.description}</p>
                  {it.attachments && it.attachments.length > 0 && (
                    <div className={styles.attachments}>
                      {it.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.attachLink}
                        >
                          📎 {att.name || att.format.toUpperCase()}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className={styles.itemActions}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => startEdit(it)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => void handleDelete(it)}
                    >
                      Eliminar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
