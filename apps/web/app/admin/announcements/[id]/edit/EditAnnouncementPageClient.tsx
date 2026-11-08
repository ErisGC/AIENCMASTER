'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import {
  adminGetAnnouncementById,
  adminUpdateAnnouncement,
} from '@/app/lib/admin-announcements';
import styles from './page.module.css';

// Límites alineados con el DTO del backend
const TITLE_MAX = 200;
const AUTHOR_MAX = 120;
const DESCRIPTION_MAX = 10_000;

export function EditAnnouncementPageClient() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await adminGetAnnouncementById(id);
        if (!mounted) return;
        setTitle(data.title);
        setDescription(data.description);
        setAuthor(data.author);
        setLoadError(null);
      } catch (err) {
        if (!mounted) return;
        setLoadError(
          err instanceof Error ? err.message : 'No se pudo cargar el anuncio.',
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (id) {
      void load();
    }

    return () => {
      mounted = false;
    };
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setFormError(null);

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedAuthor = author.trim();

    if (!trimmedTitle || !trimmedDescription || !trimmedAuthor) {
      setFormError('Todos los campos son obligatorios.');
      return;
    }
    if (trimmedTitle.length > TITLE_MAX) {
      setFormError(`El título no puede exceder ${TITLE_MAX} caracteres.`);
      return;
    }
    if (trimmedAuthor.length > AUTHOR_MAX) {
      setFormError(`El autor no puede exceder ${AUTHOR_MAX} caracteres.`);
      return;
    }
    if (trimmedDescription.length > DESCRIPTION_MAX) {
      setFormError(
        `La descripción no puede exceder ${DESCRIPTION_MAX} caracteres.`,
      );
      return;
    }

    setSaving(true);

    try {
      await adminUpdateAnnouncement(id, {
        title: trimmedTitle,
        description: trimmedDescription,
        author: trimmedAuthor,
      });
      router.push('/admin/announcements?ok=guardado');
      router.refresh();
    } catch (err) {
      setSaving(false);
      setFormError(
        err instanceof Error ? err.message : 'Error guardando cambios.',
      );
    }
  }

  if (loading) {
    return (
      <main className={styles.container}>
        <p style={{ padding: '2rem' }}>Cargando…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className={styles.container}>
        <p style={{ padding: '2rem 2rem 1rem', color: 'var(--danger)' }}>{loadError}</p>
        <p style={{ padding: '0 2rem' }}>
          <Link href="/admin/announcements">← Volver a Anuncios</Link>
        </p>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <header className={styles.header}>
          <h1>Editar anuncio</h1>
          <p>Modifica la información del anuncio</p>
        </header>

        <div className={styles.field}>
          <label htmlFor="edit-title">Título</label>
          <input
            id="edit-title"
            value={title}
            maxLength={TITLE_MAX}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="edit-description">Descripción</label>
          <textarea
            id="edit-description"
            rows={6}
            value={description}
            maxLength={DESCRIPTION_MAX}
            required
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="edit-author">Autor</label>
          <input
            id="edit-author"
            value={author}
            maxLength={AUTHOR_MAX}
            required
            onChange={(e) => setAuthor(e.target.value)}
          />
        </div>

        {formError && (
          <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{formError}</p>
        )}

        <footer className={styles.footer}>
          <Link href="/admin/announcements" className={styles.cancelLink}>
            Cancelar
          </Link>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </footer>
      </form>
    </main>
  );
}
