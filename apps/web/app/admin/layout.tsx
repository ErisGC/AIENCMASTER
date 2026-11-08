'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { EVENT_ALERTS_CHANGED, adminGetEventAlerts } from '@/app/lib/admin-events';
import {
  adminGetSession,
  adminLogout,
  adminPing,
  adminWindowClosed,
  esDispositivoPrincipal,
  type AdminSessionResponse,
} from '@/app/lib/admin-auth';
import { useIsMobileDevice } from '@/app/lib/useIsMobileDevice';
import { roleShortLabel } from '@/app/lib/i18n';
import { SupportWidget } from '@/app/components/SupportWidget';
import { ThemeToggle } from '@/app/components/ThemeToggle';
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
  // Si la sesión no se pudo consultar (red, servidor), se avisa con un botón
  // para reintentar en vez de dejar el panel esperando para siempre.
  const [sessionError, setSessionError] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Eventos próximos con cruce de horario: se muestra como insignia junto a
  // "Eventos", que es el recordatorio para los encargados.
  const [eventAlerts, setEventAlerts] = useState(0);

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
        if (!mounted) return;
        setSession(data);
        setSessionError(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setSessionError(true);
      });

    return () => {
      mounted = false;
    };
  }, [isPublic, pathname, sessionAttempt]);

  // Señal de vida mientras el panel está a la vista (la app muestra si la
  // sesión está en uso) y aviso al cerrar la ventana. Cerrar la página no
  // cierra la sesión, salvo en ventanas privadas (lo decide la API).
  useEffect(() => {
    if (isPublic || session?.status !== 'ACTIVE') return;
    const latido = () => {
      if (document.visibilityState === 'visible') {
        void adminPing().catch(() => {});
      }
    };
    const intervalo = window.setInterval(latido, 60_000);
    const alCerrar = (e: PageTransitionEvent) => {
      if (!e.persisted) adminWindowClosed();
    };
    window.addEventListener('pagehide', alCerrar);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('pagehide', alCerrar);
    };
  }, [isPublic, session?.status]);

  // Escape cierra el menú lateral en pantallas angostas.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Cerrar el menú móvil al cambiar de ruta
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isPublic || session?.status !== 'ACTIVE') return;
    let mounted = true;
    void adminGetEventAlerts()
      .then((a) => {
        if (mounted) setEventAlerts(a.count);
      })
      .catch(() => {
        /* la insignia no debe estorbar si falla */
      });
    const alCambiar = (e: Event) => {
      const n = (e as CustomEvent<number>).detail;
      if (typeof n === 'number') setEventAlerts(n);
    };
    window.addEventListener(EVENT_ALERTS_CHANGED, alCambiar);
    return () => {
      mounted = false;
      window.removeEventListener(EVENT_ALERTS_CHANGED, alCambiar);
    };
  }, [isPublic, session?.status, pathname]);

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      router.push('/admin/login');
      router.refresh();
    }
  }

  const canSeeSecurity = useMemo(() => esDispositivoPrincipal(session), [session]);

  if (isPublic) {
    return (
      <main className={styles.publicMain}>
        {/* Login, invitación, recuperación...: también se puede cambiar la
            tonalidad antes de entrar. */}
        <ThemeToggle className={styles.floatingTheme} />
        {children}
      </main>
    );
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
        <ThemeToggle className={styles.mobileThemeBtn} />
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
            href="/admin/events"
            className={isActive('/admin/events') ? styles.navActive : ''}
          >
            Eventos
            {eventAlerts > 0 && (
              <span
                className={styles.navBadge}
                aria-label={`${eventAlerts} con cruce de horario`}
              >
                {eventAlerts}
              </span>
            )}
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
          {canSeeSecurity && (
            <Link
              href="/admin/site"
              className={isActive('/admin/site') ? styles.navActive : ''}
            >
              Apariencia del portal
            </Link>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.siteLink}
          >
            Ver el portal ↗
          </a>
          <ThemeToggle className={styles.themeRow} withLabel />
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        {sessionError ? (
          <div className={styles.sessionError} role="alert">
            <strong>No pudimos comprobar tu sesión.</strong>
            <span>
              Puede ser la conexión o el servidor. Revisa tu internet e
              intenta de nuevo.
            </span>
            <button
              type="button"
              className={styles.sessionRetry}
              onClick={() => setSessionAttempt((n) => n + 1)}
            >
              Reintentar
            </button>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Soporte flotante. El administrador principal ve la bandeja de
          mensajes; los demás administradores pueden reportar fallos por el
          mismo canal que los visitantes. */}
      {session?.account?.role === 'ROOT' && <SupportWidget mode="root" />}
      {session?.account && session.account.role !== 'ROOT' && (
        <SupportWidget mode="guest" />
      )}
    </div>
    </ActiveChurchProvider>
  );
}
