'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { API_DIRECT_URL } from '@/app/lib/api';

/**
 * Conteo de visitas y descargas del portal, para las estadísticas de la cuenta
 * principal. Solo números: no se guarda quién visita. El navegador guarda un
 * identificador al azar para saber cuántas personas distintas entran al día.
 *
 * - Al abrir cada página pública se cuenta una visita.
 * - Un enlace o un audio/video con `data-contar` (y `data-objetivo`) cuenta
 *   al tocarlo o reproducirlo.
 * - El navegador de un administrador no cuenta: no es visita del público.
 */

const CLAVE_VISITANTE = 'aienc-visitante';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function visitante(): string | null {
  try {
    let v = localStorage.getItem(CLAVE_VISITANTE);
    if (!v) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      v = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(CLAVE_VISITANTE, v);
    }
    return v;
  } catch {
    return null;
  }
}

export function esNavegadorDeAdministrador(): boolean {
  try {
    return Boolean(localStorage.getItem('aienc-admin-device-id'));
  } catch {
    return false;
  }
}

/** Suma uno a lo indicado. No espera respuesta ni frena la navegación. */
export function contar(tipo: string, objetivo?: string | null) {
  if (typeof window === 'undefined' || !tipo || esNavegadorDeAdministrador()) return;
  enviar({ k: tipo, t: objetivo || undefined, v: visitante() ?? undefined });
}

/**
 * Zona desde donde visita quien aceptó compartirla. Sale ya redondeada a una
 * décima de grado (unos 11 km): la ubicación exacta no deja el equipo.
 */
export function contarZona(lat: number, lon: number) {
  if (typeof window === 'undefined' || esNavegadorDeAdministrador()) return;
  const redondo = (x: number) => Math.round(x * 10) / 10;
  enviar({ k: 'ubicacion', la: redondo(lat), lo: redondo(lon), v: visitante() ?? undefined });
}

function enviar(datos: Record<string, unknown>) {
  const cuerpo = JSON.stringify(datos);
  const url = `${API_DIRECT_URL}/analytics/hit`;
  try {
    const blob = new Blob([cuerpo], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon?.(url, blob)) return;
  } catch {
    // Sin sendBeacon: se intenta con fetch.
  }
  void fetch(url, {
    method: 'POST',
    body: cuerpo,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
    mode: 'no-cors',
  }).catch(() => {});
}

function vistaDe(path: string): [string, string?] | null {
  if (path === '/') return ['inicio'];
  const [seccion, id] = path.split('/').filter(Boolean);
  switch (seccion) {
    case 'announcements':
      return id ? (UUID.test(id) ? ['anuncio', id] : null) : ['anuncios'];
    case 'churches':
      return id ? (UUID.test(id) ? ['iglesia', id] : null) : ['iglesias'];
    case 'events':
      return ['eventos'];
    case 'info':
      return ['info'];
    case 'descargar':
      return ['descargar'];
    default:
      return null;
  }
}

export function Medidor() {
  const pathname = usePathname();

  useEffect(() => {
    const vista = vistaDe(pathname ?? '');
    if (vista) contar(vista[0], vista[1]);
  }, [pathname]);

  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-contar]');
      if (!el || el.tagName === 'AUDIO' || el.tagName === 'VIDEO') return;
      contar(el.getAttribute('data-contar') ?? '', el.getAttribute('data-objetivo'));
    };
    // "play" no burbujea: se escucha en la fase de captura.
    const alReproducir = (e: Event) => {
      const el = e.target as Element | null;
      const tipo = el?.getAttribute?.('data-contar');
      if (tipo) contar(tipo, el?.getAttribute('data-objetivo'));
    };
    document.addEventListener('click', alTocar, true);
    document.addEventListener('play', alReproducir, true);
    return () => {
      document.removeEventListener('click', alTocar, true);
      document.removeEventListener('play', alReproducir, true);
    };
  }, []);

  return null;
}
