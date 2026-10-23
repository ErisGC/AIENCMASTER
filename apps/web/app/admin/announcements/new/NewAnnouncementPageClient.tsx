'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { adminCreateAnnouncement } from '@/app/lib/admin-announcements';
import styles from './page.module.css';

export function NewAnnouncementPageClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const filesRef = useRef<File[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles = Array.from(selectedFiles);
    filesRef.current = [...filesRef.current, ...newFiles];
    setFiles([...filesRef.current]);
    resetFileInput();
  }

  function removeFile(index: number) {
    filesRef.current = filesRef.current.filter((_, i) => i !== index);
    setFiles([...filesRef.current]);
    resetFileInput();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    const form = new FormData();
    form.append('title', title);
    form.append('description', description);
    form.append('author', author);

    filesRef.current.forEach((file) => {
      form.append('files', file);
    });

    try {
      await adminCreateAnnouncement(form);
      router.push('/admin/announcements');
      router.refresh();
    } catch (err) {
      setSubmitting(false);
      alert(
        err instanceof Error && err.message
          ? `No se pudo crear el anuncio. ${err.message}`
          : 'Error creando el anuncio',
      );
    }
  }

  return (
    <main className={styles.container}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <header className={styles.header}>
          <h1>Nuevo anuncio</h1>
          <p>Publica información oficial con archivos adjuntos</p>
        </header>

        <div className={styles.field}>
          <label>Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className={styles.field}>
          <label>Descripción</label>
          <textarea
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Autor</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} required />
        </div>

        <div className={`${styles.field} ${styles.attachments}`}>
          <label>Archivos adjuntos (opcional)</label>

          <input
            ref={fileInputRef}
            type="file"
            name="files"
            multiple
            className={styles.hiddenInput}
            onChange={handleAddFiles}
          />

          {files.length > 0 && (
            <div className={styles.fileList}>
              {files.map((file, i) => (
                <div key={i} className={styles.fileItem}>
                  <span>{file.name}</span>
                  <button type="button" onClick={() => removeFile(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className={styles.addFile}
            onClick={() => fileInputRef.current?.click()}
          >
            + Añadir archivo
          </button>
        </div>

        <footer className={styles.footer}>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Publicando…' : 'Crear anuncio'}
          </button>
        </footer>
      </form>
    </main>
  );
}
