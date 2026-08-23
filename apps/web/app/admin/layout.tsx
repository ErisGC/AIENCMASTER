'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  adminGetSession,
  adminLogout,
  type AdminSessionResponse,
} from '@/app/lib/admin-auth';
import { useIsMobileDevice } from '@/app/lib/useIsMobileDevice';
import { roleShortLabel } from '@/app/lib/i18n';
import { SupportWidget } from '@/app/components/SupportWidget';
import { ActiveChurchProvider } from './_components/ActiveChurchContext';
import { ChurchSelector } from './_components/ChurchSelector';
import styles from './layout.module.css';

/**
 * Rutas accesibles sin autenticación (login, bootstrap, recovery, pending,
 * y aceptación de invitaciones via /admin/invite/[token]).
 */
function isPublicAdminPath(pathname: string | null) {
  if (!pathname) return false;
  if (
    pathname === '/admin/login' ||
    pathname === '/admin/bootstrap' ||
    pathname === '/admin/pending' ||
    pathname === '/admin/recovery' ||
    pathname === '/admin/mobile-required'
  ) {
    return true;
  }
  if (pathname.startsWith('/admin/invite/')) return true;
  return false;
}

/**
 * Rutas que no deben redirigir a /admin/mobile-required incluso en phone.
 * `/admin/invite/[token]` se exime aquí porque su propio cliente hace el
 * redirect preservando el token de invitación.
 */
function isMobileAllowedPath(pathname: string | null) {
  if (!pathname) return false;
  if (pathname === '/admin/mobile-required') return true;
  if (pathname.startsWith('/admin/invite/')) return true;
  return false;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPublic = isPublicAdminPath(pathname);
  const { isMobile, ready: mobileReady } = useIsMobileDevice();

  // En phone, todo el panel administrativo está bloqueado: se obliga a usar
  // la app nativa. La pantalla /admin/mobile-required y /admin/invite/[token]
  // sí se renderizan (la última hace su propio redirect respetando token).
  useEffect(() => {
    if (!mobileReady || !isMobile) return;
    if (isMobileAllowedPath(pathname)) return;
    router.replace('/admin/mobile-required');
  }, [mobileReady, isMobile, pathname, router]);

  useEffect(() => {
    if (isPublic) return;

    let mounted = true;
    void adminGetSession()
      .then((data) => {
        if (mounted) setSession(data);
      })
      .catch(() => {
        if (mounted) setSession(null);
      });

    return () => {
      mounted = false;
    };
  }, [isPublic, pathname]);

  // Cerrar el menú móvil al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      router.push('/admin/login');
      router.refresh();
    }
  }

  const canSeeSecurity = useMemo(() => {
    return (
      session?.status === 'ACTIVE' &&
      session.account?.role === 'ROOT' &&
      session.device?.roleScope === 'ROOT_DEVICE'
    );
  }, [session]);

  if (isPublic) {
    return <main className={styles.publicMain}>{children}</main>;
  }

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <ActiveChurchProvider session={session}>
    <div className={styles.root}>
      {/* Topbar móvil */}
      <header className={styles.mobileTop}>
        <button
          type="button"
          className={styles.mobileMenuBtn}
          aria-label="Abrir menú"
          onClick={() => setMobileOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <span className={styles.mobileTitle}>Panel admin</span>
        <div className={styles.mobileSelector}>
          <ChurchSelector />
        </div>
      </header>

      {mobileOpen && (
        <button
          className={styles.backdrop}
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}
      >
        <div className={styles.sidebarTop}>
          <div className={styles.sidebarHeader}>
            <div className={styles.brandLockup}>
              <span className={styles.brandLogo}>
                <Image
                  src="/Logoaienc.png"
                  alt="AIENC"
                  width={34}
                  height={34}
                  style={{ objectFit: 'contain' }}
                />
              </span>
              <div className={styles.brandText}>
                <h3>AIENC</h3>
                <span className={styles.brandKicker}>Panel administrativo</span>
              </div>
            </div>
            <button
              type="button"
              className={styles.sidebarClose}
              aria-label="Cerrar menú"
              onClick={() => setMobileOpen(false)}
            >
              ×
            </button>
          </div>

          {session?.account && (
            <div className={styles.sessionBox}>
              <strong>{session.account.displayName}</strong>
              <span>@{session.account.username}</span>
              <span className={styles.roleBadge}>
                {roleShortLabel(session.account.role)}
              </span>
            </div>
          )}

          <div className={styles.sidebarSelector}>
            <ChurchSelector />
          </div>
        </div>

        <nav className={styles.nav}>
          <Link
            href="/admin/dashboard"
            className={isActive('/admin/dashboard') ? styles.navActive : ''}
          >
            Métricas
          </Link>
          <Link
            href="/admin/announcements"
            className={isActive('/admin/announcements') ? styles.navActive : ''}
          >
            Anuncios
          </Link>
          <Link
            href="/admin/churches"
            className={isActive('/admin/churches') ? styles.navActive : ''}
          >
            Iglesias
          </Link>
          <Link
            href="/admin/reports"
            className={isActive('/admin/reports') ? styles.navActive : ''}
          >
            Informes
          </Link>
          <Link
            href="/admin/me"
            className={isActive('/admin/me') ? styles.navActive : ''}
          >
            Mi perfil
          </Link>
          {canSeeSecurity && (
            <Link
              href="/admin/security"
              className={isActive('/admin/security') ? styles.navActive : ''}
            >
              Seguridad
            </Link>
          )}
        </nav>

        <button
          type="button"
          className={styles.logoutBtn}
          onClick={handleLogout}
        >
          Cerrar sesión
        </button>
      </aside>

      <main className={styles.main}>{children}</main>

      {/* Bandeja de soporte flotante: sólo la ve el administrador principal.
          Se abre y se cierra cuando quiera, sin estorbar el trabajo. */}
      {session?.account?.role === 'ROOT' && <SupportWidget mode="root" />}
    </div>
    </ActiveChurchProvider>
  );
}
