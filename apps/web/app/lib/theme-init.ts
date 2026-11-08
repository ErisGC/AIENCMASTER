/*
 * Constantes de la tonalidad que necesitan tanto el layout (servidor) como el
 * hook useTheme (cliente). Viven aquí, sin 'use client', porque un componente
 * de servidor no puede leer valores exportados desde un módulo de cliente.
 */

export type Theme = 'light' | 'dark';

/** Una sola preferencia para el portal y el panel. */
export const THEME_STORAGE_KEY = 'aienc-theme';
/** Clave anterior (solo portal). Se lee para no perder la elección guardada. */
export const LEGACY_THEME_STORAGE_KEY = 'theme:public';

export const THEME_COLOR: Record<Theme, string> = {
  light: '#F5F9FD',
  dark: '#08121F',
};

/**
 * Corre en el <head> antes de pintar: aplica la tonalidad guardada para que la
 * página no parpadee con la otra al cargar. Si no hay nada guardado, claro.
 */
export const THEME_INIT_SCRIPT = `(function(){var d=document.documentElement;var t='light';try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s!=='light'&&s!=='dark'){s=localStorage.getItem('${LEGACY_THEME_STORAGE_KEY}');}if(s==='dark'||s==='light'){t=s;}}catch(e){}d.setAttribute('data-theme',t);function m(){var e=document.querySelector('meta[name="theme-color"]');if(e){e.setAttribute('content',d.getAttribute('data-theme')==='dark'?'${THEME_COLOR.dark}':'${THEME_COLOR.light}');}}m();document.addEventListener('DOMContentLoaded',m);})();`;
