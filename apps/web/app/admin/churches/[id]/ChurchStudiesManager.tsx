'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  adminCreateStudy,
  adminDeleteStudy,
  adminListStudies,
  type AdminChurchStudy,
} from '@/app/lib/admin-church-studies';

import styles from './DirectorsManager.module.css';

interface Props {
  churchId: string;
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export function ChurchStudiesManager({ churchId }: Props) {
  const [studies, setStudies] = useState<AdminChurchStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [teacherName, setTeacherName] = useState('');
  const [topic, setTopic] = useState('');
  const [outline, setOutline] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await adminListStudies(churchId);
      setStudies(list);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo cargar la lista.',
      );
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function resetForm() {
    setTeacherName('');
    setTopic('');
    setOutline('');
    setAudioFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!teacherName.trim() || !topic.trim()) {
      setError('El enseñador y el tema son obligatorios.');
      return;
    }
    if (!audioFile) {
      setError('Selecciona el archivo de audio del estudio.');
      return;
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      setError('El audio supera el máximo de 25 MB.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.append('teacherName', teacherName.trim());
    form.append('topic', topic.trim());
    if (outline.trim()) form.append('outline', outline.trim());
    form.append('audio', audioFile);

    try {
      await adminCreateStudy(churchId, form);
      resetForm();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo subir el estudio.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(s: AdminChurchStudy) {
    if (!window.confirm(`¿Eliminar el estudio "${s.topic}"?`)) return;
    try {
      await adminDeleteStudy(churchId, s.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  }

  const dateFmt = new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <section className={styles.section}>
      <header className={styles.head}>
        <h2 className={styles.title}>Estudios / mensajes en audio</h2>
        <p className={styles.subtitle}>
          Sube grabaciones (hasta 25 MB) con el nombre del enseñador y el tema.
          Aparecen en la página pública de la iglesia, más reciente primero.
        </p>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <form className={styles.form} onSubmit={handleCreate}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Enseñador</span>
            <input
              value={teacherName}
              maxLength={150}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="Ej: Pastor Juan Pérez"
              required
            />
          </label>

          <label className={styles.field}>
            <span>Tema</span>
            <input
              value={topic}
              maxLength={200}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ej: La fe que agrada a Dios"
              required
            />
          </label>
        </div>

        <label className={styles.field}>
          <span>Bosquejo (opcional)</span>
          <textarea
            value={outline}
            maxLength={8000}
            rows={4}
            onChange={(e) => setOutline(e.target.value)}
            placeholder="Puntos principales del estudio…"
          />
        </label>

        <div className={styles.fileRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            id="study-audio"
            style={{ display: 'none' }}
          />
          <label htmlFor="study-audio" className={styles.fileBtn}>
            {audioFile ? 'Cambiar audio' : 'Seleccionar audio'}
          </label>
          {audioFile && (
            <span className={styles.itemContact}>
              {audioFile.name} ({(audioFile.size / (1024 * 1024)).toFixed(1)} MB)
            </span>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={submitting}
          >
            {submitting ? 'Subiendo…' : 'Subir estudio'}
          </button>
        </div>
      </form>

      <ul className={styles.list}>
        {loading ? (
          <li className={styles.empty}>Cargando…</li>
        ) : studies.length === 0 ? (
          <li className={styles.empty}>
            Aún no hay estudios. Sube el primero arriba.
          </li>
        ) : (
          studies.map((s) => (
            <li key={s.id} className={styles.item}>
              <div className={styles.itemBody}>
                <strong>{s.topic}</strong>
                <span className={styles.itemRole}>{s.teacherName}</span>
                <span className={styles.itemContact}>
                  {dateFmt.format(new Date(s.createdAt))}
                </span>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio
                  controls
                  preload="none"
                  src={s.audioUrl}
                  style={{ width: '100%', marginTop: '0.4rem', height: 40 }}
                />
              </div>

              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => void handleDelete(s)}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
