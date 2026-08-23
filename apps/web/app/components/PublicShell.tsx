'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import styles from './PublicShell.module.css';
import { useTheme } from '@/app/lib/useTheme';
import { useIsClient } from '@/app/lib/useIsClient';
import { ScrollReveal } from './ScrollReveal';
import { SiteFooter } from './SiteFooter';
import { SupportWidget } from './SupportWidget';

type NavItem = {
  href: string;
  label: string;
};

/**
 * Items de la navegación pública.
 * NOTA: /churches (Iglesias) es una ruta real y funcional; se expone aquí
 * porque la home la referencia. El resto de rutas internas siguen
 * accesibles directamente aunque no aparezcan en el nav.
 */
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio' },
  { href: '/announcements', label: 'Anuncios' },
  { href: '/churches', label: 'Iglesias' },
  { href: '/info', label: 'Información' },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.3" />
      <path d="M12 19.2v2.3" />
      <path d="m5.4 5.4 1.6 1.6" />
      <path d="m17 17 1.6 1.6" />
      <path d="M2.5 12h2.3" />
      <path d="M19.2 12h2.3" />
      <path d="m5.4 18.6 1.6-1.6" />
      <path d="M17 7l1.6-1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 13.2A7.6 7.6 0 0 1 10.8 5a8.2 8.2 0 1 0 8.2 8.2Z" />
    </svg>
  );
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, toggleTheme } = useTheme('theme:public', 'light');
  const isClient = useIsClient();
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  // Al cerrar el menú móvil, devolver el foco al botón que lo abrió (a11y).
  // El guard evita robar el foco en el montaje inicial.
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      menuBtnRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  const isAdmin = useMemo(() => pathname?.startsWith('/admin'), [pathname]);

  // Estado "scrolled": la nav pasa de transparente (sobre el hero) a sólida.
  useEffect(() => {
    if (isAdmin) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isAdmin]);

  // Cerrar el menú móvil al cambiar de ruta. Sincronizar UI transitoria con la
  // navegación (incluido back/forward del navegador) es un uso legítimo del
  // efecto; el updater funcional hace bail-out cuando ya estaba cerrado.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen((current) => (current ? false : current));
  }, [pathname]);

  // Bloquear scroll del body con el menú móvil abierto.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // El admin conserva su propio layout: el shell público no lo envuelve.
  if (isAdmin) return <>{children}</>;

  const isHome = pathname === '/';
  const transparent = isHome && !scrolled && !open;
  const closeMobile = () => setOpen(false);

  const topnavClass = `${styles.topnav} ${
    transparent ? styles.transparent : styles.solid
  } ${scrolled ? styles.scrolled : ''}`;

  return (
    <div className={styles.shell}>
      <ScrollReveal />

      <header className={topnavClass}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} onClick={closeMobile}>
            <span className={styles.logo}>
              <Image
                src="/Logoaienc.png"
                alt="AIENC"
                width={40}
                height={40}
                priority
                style={{ objectFit: 'contain' }}
              />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>AIENC</span>
              <span className={styles.brandSub}>Portal institucional</span>
            </span>
          </Link>

          <nav className={styles.navLinks} aria-label="Navegación principal">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navLink} ${active ? styles.active : ''}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className={styles.navActions}>
            {isClient && (
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'
                }
                title={theme === 'light' ? 'Modo oscuro' : 'Modo claro'}
                className={styles.themeBtn}
              >
                <span className={styles.themeIcon} aria-hidden>
                  {theme === 'light' ? <MoonIcon /> : <SunIcon />}
                </span>
              </button>
            )}

            <button
              ref={menuBtnRef}
              type="button"
              className={styles.menuBtn}
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      {/* Menú móvil overlay a pantalla completa */}
      <div
        className={`${styles.mobileMenu} ${open ? styles.mobileOpen : ''}`}
        role="dialog"
        aria-modal={open}
        aria-label="Menú de navegación"
        aria-hidden={!open}
      >
        <nav className={styles.mobileNav}>
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.mobileLink} ${active ? styles.active : ''}`}
                onClick={closeMobile}
              >
                {item.label}
              </Link>
            );
          })}
          <Link href="/admin" className={styles.mobileAdmin} onClick={closeMobile}>
            Administración
          </Link>
        </nav>
      </div>

      {open && (
        <button
          className={styles.backdrop}
          aria-label="Cerrar menú"
          onClick={closeMobile}
        />
      )}

      <div className={isHome ? styles.contentFlush : styles.content}>
        {children}
      </div>

      <SiteFooter />

      {/* Canal para que cualquier visitante reporte fallos o sugerencias. */}
      <SupportWidget mode="guest" />
    </div>
  );
}
