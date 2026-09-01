'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  adminGetRootRecoveryStatus,
  adminGetSession,
  adminLogout,
  type AdminSessionResponse,
} from '@/app/lib/admin-auth';
import styles from '../auth.module.css';

export default function AdminPendingPage() {
  const router = useRouter();
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [rootRecoveryAvailable, setRootRecoveryAvailable] = useState(false);

  // Vive fuera del efecto para que el botón "Reintentar ahora" pueda
  // invocarla. Antes ese botón llamaba a router.refresh(), que en una página
  // de cliente como esta no vuelve a ejecutar el efecto: no hacía nada y la
  // comprobación real seguía siendo la del temporizador de cinco segundos.
  const comprobarSesion = useCallback(async () => {
    try {
      const current = await adminGetSession();
      setSession(current);

      if (current.status === 'ACTIVE') {
        router.push('/admin');
        router.refresh();
        return;
      }

      if (current.status === 'UNAUTHENTICATED') {
        router.push('/admin/login');
        router.refresh();
        return;
      }

      if (current.status === 'BOOTSTRAP_REQUIRED') {
        router.push('/admin/bootstrap');
        router.refresh();
      }
    } catch {
      setSession(null);
    }
  }, [router]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const current = await adminGetSession();
        if (!mounted) return;

        setSession(current);

        if (current.status === 'ACTIVE') {
          router.push('/admin');
          router.refresh();
          return;
        }

        if (current.status === 'UNAUTHENTICATED') {
          router.push('/admin/login');
          router.refresh();
          return;
        }

        if (current.status === 'BOOTSTRAP_REQUIRED') {
          router.push('/admin/bootstrap');
          router.refresh();
        }
      } catch {
        if (mounted) setSession(null);
      }
    }

    void adminGetRootRecoveryStatus()
      .then((data) => {
        if (mounted) setRootRecoveryAvailable(data.available);
      })
      .catch(() => {
        if (mounted) setRootRecoveryAvailable(false);
      });

    void load();
    const interval = window.setInterval(load, 5000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [router]);

  async function handleLogout() {
    // Con captura: si falla la red, igual se sale de esta pantalla en vez de
    // dejar una promesa rechazada sin manejar y al usuario atrapado aquí.
    try {
      await adminLogout();
    } catch {
      /* la sesión local se limpia de todos modos al ir al acceso */
    }
    router.push('/admin/login');
    router.refresh();
  }

  const statusText = (() => {
    switch (session?.status) {
      case 'PENDING':
        return 'Tu dispositivo está pendiente de aprobación por el root device.';
      case 'REJECTED':
        return 'La solicitud de este dispositivo fue rechazada.';
      case 'REVOKED':
        return 'Este dispositivo fue revocado y ya no tiene acceso administrativo.';
      case 'INACTIVE_ACCOUNT':
        return 'La cuenta administrativa está desactivada.';
      default:
        return 'Estamos verificando el estado de acceso.';
    }
  })();

  return (
    <div className={styles.shell}>
      <section className={styles.card}>
        <h1 className={styles.title}>Estado del acceso</h1>
        <p className={styles.subtitle}>
          El sistema revisa periódicamente si este dispositivo ya fue aprobado.
        </p>

        <div className={styles.statusBox}>{statusText}</div>

        <div className={styles.help}>
          {session?.account && (
            <p>
              Cuenta: <strong>{session.account.displayName}</strong> (@{session.account.username})
            </p>
          )}
          {session?.device && (
            <p>
              Dispositivo: <strong>{session.device.deviceName}</strong>
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => void comprobarSesion()}
          >
            Reintentar ahora
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={handleLogout}>
            Cerrar sesión
          </button>
          <Link href="/admin/login" className={styles.secondaryBtn}>
            Volver a login
          </Link>
          {rootRecoveryAvailable && session?.account?.role === 'ROOT' && (
            <Link href="/admin/recovery" className={styles.secondaryBtn}>
              Recuperar root
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
