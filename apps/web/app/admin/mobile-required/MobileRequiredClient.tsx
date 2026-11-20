'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { contar } from '@/app/components/Medidor';
import styles from './page.module.css';

/**
 * URL del APK firmado. Resolución por prioridad:
 *   1. NEXT_PUBLIC_AIENC_APK_URL si está definida y no vacía
 *   2. Fallback hardcoded al "latest release" del repo en GitHub Releases
 *      (URL evergreen que GitHub mantiene apuntando al release más reciente)
 *
 * Usamos || (no ??) y .trim() para que un string vacío también caiga al
 * fallback. Previene que una env var mal configurada (valor "") rompa la
 * descarga.
 */
const APK_URL =
  process.env.NEXT_PUBLIC_AIENC_APK_URL?.trim() ||
  'https://github.com/ErisGC/AIENCMASTER/releases/latest/download/aienc-admin.apk';

/**
 * Deep-link al esquema custom de la app Android para arrancarla con el token
 * de invitación ya cargado, si está instalada.
 *   aiencadmin://invite?token=XYZ
 */
function appDeepLink(token: string | null): string | null {
  if (!token) return 'aiencadmin://open';
  return `aiencadmin://invite?token=${encodeURIComponent(token)}`;
}

export function MobileRequiredClient() {
  const params = useSearchParams();
  const token = params?.get('token') ?? null;
  const fromInvite = Boolean(token);

  const deeplink = useMemo(() => appDeepLink(token), [token]);

  return (
    <div className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.iconWrap} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="6" y="2.5" width="12" height="19" rx="3" />
            <circle cx="12" cy="18" r="1.1" fill="currentColor" />
            <path d="M9 5h6" strokeLinecap="round" />
          </svg>
        </div>

        <h1 className={styles.title}>Descarga AIENC Admin</h1>
        <p className={styles.subtitle}>
          El panel administrativo solo se opera desde la <strong>app oficial</strong>
          en este dispositivo. Así protegemos los informes y datos de cada
          iglesia con un dispositivo de confianza.
        </p>

        {fromInvite && (
          <span className={styles.tokenChip}>
            Invitación lista para activar
          </span>
        )}

        <ol className={styles.steps}>
          <li>
            <strong>Descarga el APK</strong> tocando el botón de abajo. Si tu
            navegador lo bloquea, autoriza la descarga.
          </li>
          <li>
            <strong>Instálalo</strong> aceptando la advertencia de “fuente
            desconocida”. Solo verás esa advertencia la primera vez.
          </li>
          <li>
            {fromInvite ? (
              <>
                <strong>Abre la app</strong> y pega tu enlace de invitación, o
                vuelve a esta pantalla y pulsa “Abrir app”.
              </>
            ) : (
              <>
                <strong>Abre la app</strong> e inicia sesión con tu usuario y
                contraseña.
              </>
            )}
          </li>
        </ol>

        <div className={styles.guarded} role="note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z" />
            <path d="M9.5 12l2 2 3.5-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            Solo administradores con invitación válida pueden activar la app.
            Compartir el APK con personas no invitadas no les da acceso.
          </span>
        </div>

        <div className={styles.actions}>
          <a className={styles.primaryBtn} href={APK_URL} download onClick={() => contar('apk')}>
            Descargar APK
          </a>
          {deeplink && (
            <a className={styles.secondaryBtn} href={deeplink}>
              Ya tengo la app — Abrir
            </a>
          )}
          <Link className={styles.secondaryBtn} href="/">
            Volver al inicio
          </Link>
        </div>

        <p className={styles.foot}>
          ¿Estás usando una computadora? Abre este enlace en tu navegador de
          escritorio para entrar directamente al panel.{' '}
          <Link href="/admin/login">Ir al login web</Link>.
        </p>
      </section>
    </div>
  );
}
