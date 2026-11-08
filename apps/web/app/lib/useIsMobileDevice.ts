'use client';

import { useEffect, useState } from 'react';

/**
 * Detección de "phone" (no tablet, no desktop).
 *
 * Combina dos señales para evitar falsos positivos en tablets grandes
 * o laptops con touch:
 *   1. User-agent contiene marcadores típicos de phone (Android Mobile,
 *      iPhone, etc.). Excluye explícitamente iPad/Tablet.
 *   2. Pantalla angosta (menos de 768px) cuyo puntero principal es el dedo
 *      (pointer: coarse). Así un computador con la ventana angosta o con
 *      zoom no se toma por celular.
 *
 * Se evalúa una sola vez al cargar: antes también se recalculaba al cambiar
 * el tamaño de la ventana, y acomodar la ventana a media pantalla sacaba al
 * administrador del panel en mitad de un formulario.
 *
 * La función se ejecuta solo en cliente; durante SSR devuelve `false` para
 * no condicionar el render server y evitar mismatches.
 */
export function useIsMobileDevice(): {
  isMobile: boolean;
  ready: boolean;
} {
  const [state, setState] = useState({ isMobile: false, ready: false });

  useEffect(() => {
    const ua = window.navigator.userAgent || '';
    const isTablet = /iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/i.test(ua);
    const uaPhone = isPhoneUserAgent(ua);
    const touchPrimary =
      window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const narrowTouch = window.innerWidth < 768 && touchPrimary && !isTablet;
    // Sincroniza con una señal del navegador que solo existe en el cliente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ isMobile: uaPhone || narrowTouch, ready: true });
  }, []);

  return state;
}

/**
 * Para SSR / Route Handlers: detecta phone solo por user-agent.
 * Útil cuando no podemos depender del viewport.
 */
export function isPhoneUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (/iPad|Tablet|Nexus 7|Nexus 10|SM-T|Kindle|Silk/i.test(userAgent)) {
    return false;
  }
  if (/Android/i.test(userAgent) && /Mobile/i.test(userAgent)) return true;
  if (/iPhone|iPod/i.test(userAgent)) return true;
  if (/Windows Phone|IEMobile/i.test(userAgent)) return true;
  return false;
}
