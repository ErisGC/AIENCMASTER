'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './page.module.css';
import type { Church } from '@/app/lib/admin-churches';
import { formatDateTimeWithSeconds } from '@/app/lib/formatDate';
import {
  adminDeleteChurch,
  adminToggleChurch,
  adminUpdateChurchMultipart,
} from '@/app/lib/admin-churches';
import { DirectorsManager } from './DirectorsManager';
import { ChurchAnnouncementsManager } from './ChurchAnnouncementsManager';
import { ChurchStudiesManager } from './ChurchStudiesManager';

type PickedPoint = { lat: number; lng: number; url?: string };

// Si ya tienes MapPicker disponible aquí, úsalo.
// Si no lo quieres en edición, puedes comentar el bloque del mapa.
const MapPicker = dynamic(
  () => import('../new/MapPicker').then((mod) => mod.MapPicker),
  { ssr: false },
);

export function EditChurchClient({ initialChurch }: { initialChurch: Church }) {
  const router = useRouter();

  const [church, setChurch] = useState<Church>(initialChurch);

  // form state
  const [name, setName] = useState(initialChurch.name ?? '');
  const [city, setCity] = useState(initialChurch.city ?? '');
  const [address, setAddress] = useState(initialChurch.address ?? '');
  const [avgAttendance, setAvgAttendance] = useState(
    initialChurch.avgAttendance != null ? String(initialChurch.avgAttendance) : '',
  );
  const [isActive, setIsActive] = useState<boolean>(!!initialChurch.isActive);

  const initialPoint: PickedPoint | null = useMemo(() => {
    if (initialChurch.mapsLat != null && initialChurch.mapsLng != null) {
      const lat = Number(Number(initialChurch.mapsLat).toFixed(7));
      const lng = Number(Number(initialChurch.mapsLng).toFixed(7));
      return {
        lat,
        lng,
        url:
          initialChurch.mapsUrl ||
          `https://www.google.com/maps?q=${lat},${lng}`,
      };
    }
    return null;
  }, [initialChurch.mapsLat, initialChurch.mapsLng, initialChurch.mapsUrl]);

  const [point, setPoint] = useState<PickedPoint | null>(initialPoint);

  // files
  const mainInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const mainFileRef = useRef<File | null>(null);
  const coverFileRef = useRef<File | null>(null);

  const [mainFile, setMainFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function resetInput(ref: React.RefObject<HTMLInputElement | null>) {
    if (ref.current) ref.current.value = '';
  }

  function handlePickMain(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    mainFileRef.current = f;
    setMainFile(f);
    resetInput(mainInputRef);
  }

  function handlePickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    coverFileRef.current = f;
    setCoverFile(f);
    resetInput(coverInputRef);
  }

  function removeMain() {
    mainFileRef.current = null;
    setMainFile(null);
    resetInput(mainInputRef);
  }

  function removeCover() {
    coverFileRef.current = null;
    setCoverFile(null);
    resetInput(coverInputRef);
  }

  function setPointFromLatLng(lat: number, lng: number) {
    const fixedLat = Number(lat.toFixed(7));
    const fixedLng = Number(lng.toFixed(7));
    const url = `https://www.google.com/maps?q=${fixedLat},${fixedLng}`;
    setPoint({ lat: fixedLat, lng: fixedLng, url });
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      alert('Este navegador no soporta geolocalización.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => setPointFromLatLng(pos.coords.latitude, pos.coords.longitude),
      () => alert('No se pudo obtener la ubicación. Verifica permisos del navegador.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function clearLocation() {
    setPoint(null);
  }

  async function onSave() {
    if (saving) return;
    setSaving(true);

    const form = new FormData();
    form.append('name', name.trim());
    form.append('city', city.trim());

    form.append('address', address.trim());

    if (avgAttendance.trim()) {
      const n = Number(avgAttendance);
      if (Number.isFinite(n)) form.append('avgAttendance', String(Math.trunc(n)));
    } else {
      form.append('avgAttendance', '');
    }

    form.append('isActive', isActive ? 'true' : 'false');

    if (point) {
      form.append('mapsLat', String(point.lat));
      form.append('mapsLng', String(point.lng));
      form.append('mapsUrl', point.url ?? '');
    } else {
      // si quieres permitir “quitar ubicación”, manda vacío (tu backend hoy lo interpretará como undefined)
      form.append('mapsLat', '');
      form.append('mapsLng', '');
      form.append('mapsUrl', '');
    }

    if (mainFileRef.current) form.append('mainImage', mainFileRef.current);
    if (coverFileRef.current) form.append('coverImage', coverFileRef.current);

    try {
      const updated = await adminUpdateChurchMultipart(church.id, form);
      setChurch(updated);

      // sincroniza estado con lo guardado
      setName(updated.name ?? '');
      setCity(updated.city ?? '');
      setAddress(updated.address ?? '');
      setAvgAttendance(updated.avgAttendance != null ? String(updated.avgAttendance) : '');
      setIsActive(!!updated.isActive);

      if (updated.mapsLat != null && updated.mapsLng != null) {
        const lat = Number(Number(updated.mapsLat).toFixed(7));
        const lng = Number(Number(updated.mapsLng).toFixed(7));
        setPoint({
          lat,
          lng,
          url: updated.mapsUrl || `https://www.google.com/maps?q=${lat},${lng}`,
        });
      } else {
        setPoint(null);
      }

      // limpia selección de archivos (ya quedaron subidos)
      removeMain();
      removeCover();

      alert('Cambios guardados.');
      router.refresh();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error(e);
      alert('No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  async function onToggle() {
    if (toggling) return;

    const ok = confirm(`¿Cambiar estado de esta iglesia?`);
    if (!ok) return;

    setToggling(true);
    try {
      const updated = await adminToggleChurch(church.id);
      setChurch(updated);
      setIsActive(!!updated.isActive);
      alert(`Estado actualizado: ${updated.isActive ? 'Activa' : 'Inactiva'}`);
      router.refresh();
    } catch (e) {
      console.error(e);
      alert('No se pudo cambiar el estado.');
    } finally {
      setToggling(false);
    }
  }

  async function onDelete() {
    if (deleting) return;

    const ok1 = confirm('Esto eliminará la iglesia y sus imágenes. ¿Continuar?');
    if (!ok1) return;

    const ok2 = confirm('Confirmación final: ¿Eliminar definitivamente?');
    if (!ok2) return;

    setDeleting(true);
    try {
      await adminDeleteChurch(church.id);
      alert('Iglesia eliminada.');
      router.push('/admin/churches');
      router.refresh();
    } catch (e) {
      console.error(e);
      alert('No se pudo eliminar.');
    } finally {
      setDeleting(false);
    }
  }

  const badge = isActive ? styles.badgeActive : styles.badgeInactive;

  return (
    <div className={styles.shell}>
      {/* HERO */}
      <section className={styles.hero}>
        {church.coverImageUrl ? (
          <Image
            src={church.coverImageUrl}
            alt={`Portada de ${church.name}`}
            fill
            className={styles.heroImg}
            sizes="100vw"
            priority
          />
        ) : (
          <div className={styles.heroFallback} aria-hidden="true" />
        )}
        <div className={styles.heroOverlay} />

        <div className={styles.heroInner}>
          <div className={styles.avatar}>
            {church.mainImageUrl ? (
              <Image
                src={church.mainImageUrl}
                alt={church.name}
                fill
                className={styles.avatarImg}
                sizes="96px"
              />
            ) : (
              <div className={styles.avatarPlaceholder} aria-hidden="true" />
            )}
          </div>

          <div className={styles.heroText}>
            <div className={styles.heroTopRow}>
              <h1 className={styles.title}>{church.name}</h1>
              <span className={`${styles.badge} ${badge}`}>
                {isActive ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <p className={styles.subtitle}>
              {church.city}
              {church.avgAttendance != null ? ` • Prom: ${church.avgAttendance}` : ''}
            </p>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={onToggle}
                disabled={toggling}
              >
                {toggling ? 'Cambiando…' : isActive ? 'Marcar inactiva' : 'Marcar activa'}
              </button>

              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onSave}
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* GRID */}
      <div className={styles.grid}>
        {/* FORM CARD */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Datos</h2>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className={styles.field}>
              <label>Ciudad</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} required />
            </div>

            <div className={`${styles.field} ${styles.full}`}>
              <label>Dirección (opcional)</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <div className={styles.field}>
              <label>Prom. asistencia (opcional)</label>
              <input
                inputMode="numeric"
                value={avgAttendance}
                onChange={(e) => setAvgAttendance(e.target.value)}
                placeholder="Ej: 120"
              />
            </div>

            <div className={styles.field}>
              <label>Estado</label>
              <select
                value={isActive ? '1' : '0'}
                onChange={(e) => setIsActive(e.target.value === '1')}
              >
                <option value="1">Activa</option>
                <option value="0">Inactiva</option>
              </select>
            </div>
          </div>

          <div className={styles.meta}>
            <div className={styles.metaRow}>
              <span className={styles.muted}>ID</span>
              <code className={styles.code}>{church.id}</code>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.muted}>Creada</span>
              <span className={styles.value}>
                {formatDateTimeWithSeconds(church.createdAt)}
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.muted}>Actualizada</span>
              <span className={styles.value}>
                {formatDateTimeWithSeconds(church.updatedAt)}
              </span>
            </div>
          </div>
        </section>

        {/* LOCATION CARD */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>Ubicación</h2>

            <div className={styles.inlineBtns}>
              <button type="button" className={styles.ghostBtn} onClick={useMyLocation}>
                Usar mi ubicación
              </button>
              {point && (
                <button type="button" className={styles.dangerGhost} onClick={clearLocation}>
                  Quitar
                </button>
              )}
            </div>
          </div>

          <MapPicker
            value={point ? { lat: point.lat, lng: point.lng } : null}
            onChange={(p) => setPointFromLatLng(p.lat, p.lng)}
            center={point ? { lat: point.lat, lng: point.lng } : undefined}
            zoom={point ? 15 : 13}
          />

          <div className={styles.locationBox}>
            {point ? (
              <>
                <div className={styles.locationRow}>
                  <span className={styles.muted}>Lat</span>
                  <strong>{point.lat}</strong>
                </div>
                <div className={styles.locationRow}>
                  <span className={styles.muted}>Lng</span>
                  <strong>{point.lng}</strong>
                </div>
                {point.url && (
                  <a className={styles.mapsLink} href={point.url} target="_blank" rel="noreferrer">
                    Ver en Maps →
                  </a>
                )}
              </>
            ) : (
              <p className={styles.muted}>
                Sin ubicación asignada. Puedes fijarla en el mapa o usar tu ubicación.
              </p>
            )}
          </div>
        </section>

        {/* IMAGES CARD */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Imágenes</h2>

          <div className={styles.imageGrid}>
            <div className={styles.imageSlot}>
              <div className={styles.imageLabel}>Principal (tarjeta)</div>
              <div className={styles.imagePreview}>
                {church.mainImageUrl ? (
                  <Image
                    src={church.mainImageUrl}
                    alt="Imagen principal"
                    fill
                    className={styles.previewImg}
                    sizes="(max-width: 1000px) 100vw, 420px"
                  />
                ) : (
                  <div className={styles.previewPlaceholder} />
                )}
              </div>

              <input
                ref={mainInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={handlePickMain}
              />

              <div className={styles.fileRow}>
                <span className={styles.fileName}>
                  {mainFile ? mainFile.name : <em className={styles.muted}>sin cambios</em>}
                </span>

                {mainFile ? (
                  <button type="button" className={styles.removeBtn} onClick={removeMain}>
                    ✕
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.pickBtn}
                    onClick={() => mainInputRef.current?.click()}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            </div>

            <div className={styles.imageSlot}>
              <div className={styles.imageLabel}>Portada (detalle)</div>
              <div className={styles.imagePreview}>
                {church.coverImageUrl ? (
                  <Image
                    src={church.coverImageUrl}
                    alt="Imagen de portada"
                    fill
                    className={styles.previewImg}
                    sizes="(max-width: 1000px) 100vw, 420px"
                  />
                ) : (
                  <div className={styles.previewPlaceholder} />
                )}
              </div>

              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className={styles.hiddenInput}
                onChange={handlePickCover}
              />

              <div className={styles.fileRow}>
                <span className={styles.fileName}>
                  {coverFile ? coverFile.name : <em className={styles.muted}>sin cambios</em>}
                </span>

                {coverFile ? (
                  <button type="button" className={styles.removeBtn} onClick={removeCover}>
                    ✕
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.pickBtn}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    Cambiar
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className={styles.help}>
            Selecciona archivos y pulsa <strong>Guardar cambios</strong>.
          </p>
        </section>

        {/* DIRECTORS */}
        <DirectorsManager churchId={initialChurch.id} />

        {/* ANUNCIOS DE LA IGLESIA */}
        <ChurchAnnouncementsManager churchId={initialChurch.id} />

        {/* ESTUDIOS EN AUDIO */}
        <ChurchStudiesManager churchId={initialChurch.id} />

        {/* DANGER */}
        <section className={`${styles.card} ${styles.dangerCard}`}>
          <h2 className={styles.cardTitle}>Zona de riesgo</h2>
          <p className={styles.dangerText}>
            Eliminar borra el registro y también intenta borrar imágenes en Cloudinary.
          </p>

          <button
            type="button"
            className={styles.dangerBtn}
            onClick={onDelete}
            disabled={deleting}
          >
            {deleting ? 'Eliminando…' : 'Eliminar iglesia'}
          </button>
        </section>
      </div>
    </div>
  );
}
