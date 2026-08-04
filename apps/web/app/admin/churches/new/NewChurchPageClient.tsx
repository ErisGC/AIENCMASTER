'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { adminCreateChurchMultipart } from '@/app/lib/admin-churches';
import styles from './page.module.css';

type PickedPoint = {
  lat: number;
  lng: number;
  url?: string;
};

const MapPicker = dynamic(
  () => import('./MapPicker').then((mod) => mod.MapPicker),
  { ssr: false },
);

export function NewChurchPageClient() {
  const router = useRouter();
  const mainInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const mainFileRef = useRef<File | null>(null);
  const coverFileRef = useRef<File | null>(null);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [avgAttendance, setAvgAttendance] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [point, setPoint] = useState<PickedPoint | null>(null);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function resetInput(ref: React.RefObject<HTMLInputElement | null>) {
    if (ref.current) ref.current.value = '';
  }

  function handlePickMain(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    mainFileRef.current = file;
    setMainFile(file);
    resetInput(mainInputRef);
  }

  function handlePickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    coverFileRef.current = file;
    setCoverFile(file);
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
      (pos) => {
        setPointFromLatLng(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        alert('No se pudo obtener la ubicación. Verifica permisos del navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function clearLocation() {
    setPoint(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    const form = new FormData();
    form.append('name', name.trim());
    form.append('city', city.trim());
    if (address.trim()) form.append('address', address.trim());
    if (avgAttendance.trim()) form.append('avgAttendance', String(Number(avgAttendance)));
    form.append('isActive', isActive ? 'true' : 'false');

    if (point) {
      form.append('mapsLat', String(point.lat));
      form.append('mapsLng', String(point.lng));
      if (point.url) form.append('mapsUrl', point.url);
    }

    if (mainFileRef.current) form.append('mainImage', mainFileRef.current);
    if (coverFileRef.current) form.append('coverImage', coverFileRef.current);

    try {
      const created = await adminCreateChurchMultipart(form);
      if (created?.id) router.push(`/admin/churches/${created.id}`);
      else router.push('/admin/churches');
      router.refresh();
    } catch {
      setSubmitting(false);
      alert('Error creando la iglesia');
    }
  }

  return (
    <main className={styles.container}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <header className={styles.header}>
          <h1>Nueva iglesia</h1>
          <p>Crea el registro y adjunta imágenes. La ubicación se elige sin latitudes manuales.</p>
        </header>

        <div className={styles.grid}>
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

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h3>Ubicación</h3>
              <p>Elige la ubicación sin escribir coordenadas.</p>
            </div>

            <div className={styles.inlineBtns}>
              <button type="button" className={styles.ghostBtn} onClick={useMyLocation}>
                Usar mi ubicación
              </button>

              <a
                className={styles.ghostBtn}
                href="https://www.google.com/maps"
                target="_blank"
                rel="noreferrer"
              >
                Abrir Maps
              </a>

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
                Sin ubicación asignada. Puedes usar “Usar mi ubicación” o elegirla en el mapa.
              </p>
            )}
          </div>
        </section>

        <section className={`${styles.field} ${styles.attachments}`}>
          <label>Imágenes (opcional)</label>

          <input
            ref={mainInputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={handlePickMain}
          />

          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenInput}
            onChange={handlePickCover}
          />

          <div className={styles.fileList}>
            <div className={styles.fileItem}>
              <span>
                <strong>Imagen principal:</strong>{' '}
                {mainFile ? mainFile.name : <em className={styles.muted}>no seleccionada</em>}
              </span>

              <div className={styles.fileActions}>
                {mainFile ? (
                  <button type="button" onClick={removeMain} className={styles.removeBtn}>
                    ×
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.pickBtn}
                    onClick={() => mainInputRef.current?.click()}
                  >
                    Elegir
                  </button>
                )}
              </div>
            </div>

            <div className={styles.fileItem}>
              <span>
                <strong>Imagen de portada:</strong>{' '}
                {coverFile ? coverFile.name : <em className={styles.muted}>no seleccionada</em>}
              </span>

              <div className={styles.fileActions}>
                {coverFile ? (
                  <button type="button" onClick={removeCover} className={styles.removeBtn}>
                    ×
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.pickBtn}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    Elegir
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className={styles.help}>
            La imagen principal se usa en tarjetas. La portada se usa en la página de detalle.
          </p>
        </section>

        <footer className={styles.footer}>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Crear iglesia'}
          </button>
        </footer>
      </form>
    </main>
  );
}
