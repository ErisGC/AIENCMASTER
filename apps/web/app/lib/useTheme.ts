'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { THEME_COLOR, THEME_STORAGE_KEY, type Theme } from './theme-init';

export type { Theme };
function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? 'dark'
    : 'light';
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  // Si se cambia en otra pestaña, esta también se pone al día.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    if (event.newValue === 'light' || event.newValue === 'dark') {
      applyTheme(event.newValue, { persist: false, animate: false });
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    observer.disconnect();
    window.removeEventListener('storage', onStorage);
  };
}

let switchTimer: number | undefined;

export function applyTheme(
  theme: Theme,
  { persist = true, animate = true }: { persist?: boolean; animate?: boolean } = {}
) {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (animate && !reduceMotion) {
    // Funde los colores durante el cambio (ver globals.css).
    root.classList.add('theme-switching');
    window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(
      () => root.classList.remove('theme-switching'),
      380
    );
  }

  root.setAttribute('data-theme', theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[theme]);

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* modo privado o almacenamiento bloqueado: el cambio vale en esta visita */
    }
  }
}

/**
 * Tonalidad actual del sitio. Todas las instancias (barra pública, panel,
 * pantallas de acceso) leen el mismo atributo, así que siempre coinciden.
 * En el servidor se asume claro; el script del <head> ya pintó la correcta.
 */
export function useTheme() {
  const theme = useSyncExternalStore<Theme>(
    subscribe,
    readTheme,
    () => 'light'
  );

  const setTheme = useCallback((next: Theme) => applyTheme(next), []);
  const toggleTheme = useCallback(
    () => applyTheme(readTheme() === 'light' ? 'dark' : 'light'),
    []
  );

  return { theme, setTheme, toggleTheme };
}
