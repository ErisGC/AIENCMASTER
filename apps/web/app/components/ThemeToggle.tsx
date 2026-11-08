'use client';

import { useTheme } from '@/app/lib/useTheme';
import styles from './ThemeToggle.module.css';

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M19 13.2A7.6 7.6 0 0 1 10.8 5a8.2 8.2 0 1 0 8.2 8.2Z" />
    </svg>
  );
}

type Props = {
  /** Clase del contenedor que le da forma según dónde va (barra, panel...). */
  className?: string;
  /** Muestra el nombre del modo al lado del ícono. */
  withLabel?: boolean;
};

/**
 * Botón de sol y luna para alternar entre el modo claro (Nueva Jerusalén) y el
 * oscuro. Los dos íconos se pintan siempre y el CSS muestra el que toca según
 * el data-theme del documento, así no hay parpadeo al cargar.
 */
export function ThemeToggle({ className, withLabel = false }: Props) {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${styles.toggle} ${className ?? ''}`}
      aria-label={nextLabel}
      title={nextLabel}
    >
      <span className={styles.icons} aria-hidden>
        <span className={styles.moon}>
          <MoonIcon />
        </span>
        <span className={styles.sun}>
          <SunIcon />
        </span>
      </span>
      {withLabel && (
        <span className={styles.label}>
          <span className={styles.labelLight}>Modo oscuro</span>
          <span className={styles.labelDark}>Modo claro</span>
        </span>
      )}
    </button>
  );
}
