'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  adminCreateDirector,
  adminDeleteDirector,
  adminListDirectors,
  adminUpdateDirector,
  type AdminDirector,
} from '@/app/lib/directors';

import styles from './DirectorsManager.module.css';

interface Props {
  churchId: string;
}

export function DirectorsManager({ churchId }: Props) {
  const [directors, setDirectors] = useState<AdminDirector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state (creación)
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await adminListDirectors(churchId);
      setDirectors(list);
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

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPhotoPreview(null);
    }
  }

  function resetCreateForm() {
    setDisplayName('');
    setRole('');
    setPhone('');
    setEmail('');
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!displayName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const form = new FormData();
    form.append('displayName', displayName.trim());
    if (role.trim()) form.append('role', role.trim());
    if (phone.trim()) form.append('phone', phone.trim());
    if (email.trim()) form.append('email', email.trim());
    if (photoFile) form.append('photo', photoFile);

    try {
      await adminCreateDirector(churchId, form);
      resetCreateForm();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo crear el director.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(d: AdminDirector) {
    if (!window.confirm(`¿Eliminar a "${d.displayName}"?`)) return;
    try {
      await adminDeleteDirector(d.id);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo eliminar.',
      );
    }
  }

  function startEdit(d: AdminDirector) {
    setEditingId(d.id);
    setEditDisplayName(d.displayName);
    setEditRole(d.role);
    setEditPhone(d.phone ?? '');
    setEditEmail(d.email ?? '');
    setEditPhotoFile(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editDisplayName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    const form = new FormData();
    form.append('displayName', editDisplayName.trim());
    form.append('role', editRole.trim());
    // Se envían siempre (aunque vacíos) para permitir limpiar el campo.
    form.append('phone', editPhone.trim());
    form.append('email', editEmail.trim());
    if (editPhotoFile) form.append('photo', editPhotoFile);
    try {
      await adminUpdateDirector(editingId, form);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo actualizar.',
      );
    }
  }

  return (
    <section className={styles.section}>
      <header className={styles.head}>
        <h2 className={styles.title}>Directores / encargados</h2>
        <p className={styles.subtitle}>
          Define las personas que aparecen como responsables de esta iglesia
          en su página pública. Si una cuenta administrativa subió foto de
          perfil, esa foto se hereda automáticamente.
        </p>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {/* Form crear */}
      <form className={styles.form} onSubmit={handleCreate}>
        <div className={styles.row}>
          <label className={styles.field}>
            <span>Nombre</span>
            <input
              value={displayName}
              maxLength={150}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ej: Pastor Juan Pérez"
              required
            />
          </label>

          <label className={styles.field}>
            <span>Cargo (opcional)</span>
            <input
              value={role}
              maxLength={120}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Ej: Pastor principal"
            />
          </label>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span>Celular (opcional)</span>
            <input
              value={phone}
              maxLength={40}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej: 300 123 4567"
              inputMode="tel"
            />
          </label>

          <label className={styles.field}>
            <span>Correo (opcional)</span>
            <input
              value={email}
              maxLength={150}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ej: pastor@iglesia.com"
              type="email"
            />
          </label>
        </div>

        <div className={styles.fileRow}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            id="director-photo"
            style={{ display: 'none' }}
          />
          <label htmlFor="director-photo" className={styles.fileBtn}>
            {photoFile ? 'Cambiar foto' : 'Subir foto (opcional)'}
          </label>
          {photoPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="Vista previa"
              className={styles.photoPreview}
            />
          )}
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn} disabled={submitting}>
            {submitting ? 'Guardando…' : 'Agregar director'}
          </button>
        </div>
      </form>

      {/* Lista */}
      <ul className={styles.list}>
        {loading ? (
          <li className={styles.empty}>Cargando…</li>
        ) : directors.length === 0 ? (
          <li className={styles.empty}>
            Aún no hay directores registrados. Agrega el primero arriba.
          </li>
        ) : (
          directors.map((d) => {
            const isEditing = editingId === d.id;
            const photo = d.linkedAdminPhotoUrl ?? d.photoUrl;
            return (
              <li key={d.id} className={styles.item}>
                <div className={styles.avatarWrap}>
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo} alt={d.displayName} className={styles.avatar} />
                  ) : (
                    <div className={styles.avatarFallback}>
                      {d.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className={styles.itemBody}>
                  {isEditing ? (
                    <div className={styles.editForm}>
                      <input
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        placeholder="Nombre"
                        maxLength={150}
                      />
                      <input
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        placeholder="Cargo"
                        maxLength={120}
                      />
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Celular"
                        maxLength={40}
                        inputMode="tel"
                      />
                      <input
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Correo"
                        maxLength={150}
                        type="email"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setEditPhotoFile(e.target.files?.[0] ?? null)
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <strong>{d.displayName}</strong>
                      {d.role && <span className={styles.itemRole}>{d.role}</span>}
                      {(d.phone || d.email) && (
                        <span className={styles.itemContact}>
                          {[d.phone, d.email].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {d.linkedAdminUsername && (
                        <span className={styles.linkedFlag}>
                          Vinculado a @{d.linkedAdminUsername}
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className={styles.itemActions}>
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        className={styles.primaryBtnSmall}
                        onClick={() => void saveEdit()}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => startEdit(d)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => void handleDelete(d)}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
