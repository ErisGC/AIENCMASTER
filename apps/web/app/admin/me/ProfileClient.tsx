'use client';

import { useEffect, useRef, useState } from 'react';

import { AvatarCropper } from '@/app/components/AvatarCropper';
import {
  adminGetMyProfile,
  adminRemoveMyPhoto,
  adminUploadMyPhoto,
  type AdminProfile,
} from '@/app/lib/admin-profile';

import { roleShortLabel } from '@/app/lib/i18n';
import styles from './page.module.css';

export function ProfileClient() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    void adminGetMyProfile()
      .then((p) => {
        if (mounted) setProfile(p);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(
          err instanceof Error ? err.message : 'No se pudo cargar el perfil.',
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingSrc(reader.result as string);
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCropComplete(blob: Blob) {
    setSubmitting(true);
    try {
      const res = await adminUploadMyPhoto(blob);
      setProfile((prev) =>
        prev ? { ...prev, profilePhotoUrl: res.profilePhotoUrl } : prev,
      );
      setPendingSrc(null);
      setToast('Foto actualizada correctamente.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo subir la foto.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm('¿Quitar tu foto de perfil?')) return;
    try {
      await adminRemoveMyPhoto();
      setProfile((prev) =>
        prev ? { ...prev, profilePhotoUrl: null } : prev,
      );
      setToast('Foto eliminada.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo quitar la foto.',
      );
    }
  }

  if (error && !profile) {
    return (
      <main className={styles.page}>
        <div className={styles.errorBanner}>{error}</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={styles.page}>
        <p className={styles.loading}>Cargando perfil…</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Mi perfil</h1>
        <p className={styles.subtitle}>
          Tu foto se mostrará automáticamente en la página pública de la
          iglesia que administras si estás vinculado como director.
        </p>
      </header>

      {toast && <div className={styles.toast}>{toast}</div>}

      <section className={styles.card}>
        <div className={styles.profileRow}>
          <div className={styles.avatarLarge}>
            {profile.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.profilePhotoUrl}
                alt={profile.displayName}
                className={styles.avatarImg}
              />
            ) : (
              <div className={styles.avatarFallback}>
                {profile.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className={styles.info}>
            <strong>{profile.displayName}</strong>
            <span>@{profile.username}</span>
            <span className={styles.role}>{roleShortLabel(profile.role)}</span>
            {profile.assignedChurchName && (
              <span className={styles.church}>
                Iglesia asignada:{' '}
                <strong>{profile.assignedChurchName}</strong>
              </span>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFileChange}
            id="profile-photo"
            style={{ display: 'none' }}
          />
          <label htmlFor="profile-photo" className={styles.uploadBtn}>
            {profile.profilePhotoUrl ? 'Cambiar foto' : 'Subir foto'}
          </label>
          {profile.profilePhotoUrl && (
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => void handleRemove()}
            >
              Quitar foto
            </button>
          )}
        </div>

        {error && <p className={styles.errorBanner}>{error}</p>}
      </section>

      {pendingSrc && (
        <AvatarCropper
          imageSrc={pendingSrc}
          onComplete={(b) => void handleCropComplete(b)}
          onCancel={() => !submitting && setPendingSrc(null)}
        />
      )}
    </main>
  );
}
