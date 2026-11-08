'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  adminGetBootstrapStatus,
  adminGetRootRecoveryStatus,
  adminLogin,
  esConflictoDeDispositivo,
} from '@/app/lib/admin-auth';
import {
  adminDeviceIdFor,
  getBrowserName,
  getDefaultAdminDeviceName,
  getPlatformName,
  newAdminDeviceIdFor,
} from '@/app/lib/admin-device';
import { destinoTrasLogin } from '@/app/lib/admin-session-expired';
import styles from '../auth.module.css';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [rootRecoveryAvailable, setRootRecoveryAvailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  // Ventana privada o equipo compartido: al cerrar la ventana la sesión se
  // cierra y el equipo deja de estar aprobado.
  const [ephemeral, setEphemeral] = useState(false);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setDeviceName(getDefaultAdminDeviceName());
      // Llegó aquí porque la sesión venció a mitad de algo (ver
      // admin-session-expired.ts): se le explica y luego vuelve a esa página.
      setSessionExpired(
        new URLSearchParams(window.location.search).get('vencida') === '1',
      );
    });

    // Las ventanas privadas suelen tener muy poco espacio de almacenamiento:
    // si lo parece, se deja marcada la casilla (la persona puede cambiarla).
    void navigator.storage
      ?.estimate?.()
      .then((e) => {
        if (typeof e.quota === 'number' && e.quota < 1.2 * 1024 ** 3) {
          setEphemeral(true);
        }
      })
      .catch(() => {});

    void adminGetBootstrapStatus()
      .then((data) => setBootstrapAvailable(data.available))
      .catch(() => setBootstrapAvailable(false));

    void adminGetRootRecoveryStatus()
      .then((data) => setRootRecoveryAvailable(data.available))
      .catch(() => setRootRecoveryAvailable(false));

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // Validaciones cliente
    const trimmedUser = username.trim();
    const trimmedDevice = deviceName.trim();
    if (!trimmedUser || trimmedUser.length > 50) {
      setError('El nombre de usuario debe tener entre 1 y 50 caracteres.');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError('La contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }
    if (!trimmedDevice || trimmedDevice.length > 100) {
      setError('El nombre del dispositivo es obligatorio (máx. 100).');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const datos = {
        username: trimmedUser,
        password,
        deviceName: trimmedDevice,
        platform: getPlatformName(),
        browser: getBrowserName(),
        ephemeral,
      };
      let session;
      try {
        session = await adminLogin({
          ...datos,
          deviceId: adminDeviceIdFor(trimmedUser),
        });
      } catch (err) {
        if (!esConflictoDeDispositivo(err)) throw err;
        // Este navegador es de otra cuenta: esta entra con una identidad
        // propia, que igual tiene que aprobarse.
        session = await adminLogin({
          ...datos,
          deviceId: newAdminDeviceIdFor(trimmedUser),
        });
      }

      if (session.status === 'ACTIVE') {
        router.push(destinoTrasLogin(window.location.search));
      } else if (session.status === 'PAUSED') {
        setError(
          'Esta sesión está pausada desde la app del teléfono. Reactívala allí (Seguridad, Sesiones) para entrar.',
        );
        setSubmitting(false);
        return;
      } else {
        router.push('/admin/pending');
      }
      router.refresh();
    } catch (err) {
      // Sólo mostramos errores si son mensajes amigables generados por el cliente.
      // Cualquier respuesta del backend ya viene sanitizada por adminRequest().
      setError(
        err instanceof Error && err.message.length < 200
          ? err.message
          : 'No se pudo iniciar sesión.',
      );
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.card}>
        <h1 className={styles.title}>Acceso administrativo</h1>
        <p className={styles.subtitle}>
          El ingreso depende de la cuenta y también del dispositivo autorizado.
        </p>

        {sessionExpired && (
          <p className={styles.notice} role="status">
            Tu sesión venció. Ingresa de nuevo y vuelves a la página donde
            estabas.
          </p>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label>Usuario</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>

          <div className={styles.field}>
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label>Nombre del dispositivo</label>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              required
            />
          </div>

          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={ephemeral}
              onChange={(e) => setEphemeral(e.target.checked)}
            />
            <span>
              Ventana privada o equipo compartido
              <small>
                Al cerrar la ventana, la sesión se cierra y este equipo deja de
                estar aprobado.
              </small>
            </span>
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button type="submit" className={styles.primaryBtn} disabled={submitting}>
              {submitting ? 'Ingresando…' : 'Ingresar'}
            </button>

            {bootstrapAvailable && (
              <Link href="/admin/bootstrap" className={styles.secondaryBtn}>
                Crear la cuenta principal
              </Link>
            )}
            {rootRecoveryAvailable && (
              <Link href="/admin/recovery" className={styles.secondaryBtn}>
                Recuperar la cuenta principal
              </Link>
            )}
          </div>
        </form>

        <Link href="/" className={styles.backToSite}>
          ← Volver al portal
        </Link>
      </section>
    </div>
  );
}
