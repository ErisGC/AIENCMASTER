import { abrirAnuncios, cerrarAnuncios } from '@/app/lib/zona-cookie';

import { contarZona } from './Medidor';

/**
 * Lo común entre el aviso del portal y la pantalla que protege los anuncios:
 * la decisión que tomó la persona, el estado del permiso y la consulta de la
 * ubicación. Lo que sale del equipo es la zona redondeada a unos 11 km.
 */

const CLAVE = 'aienc-zona';

export interface Decision {
  r: 'si' | 'no';
  t: number;
  /** Último día (AAAA-MM-DD) en que se envió la zona. */
  e?: string;
}

export type Motivo = 'negada' | 'bloqueada' | 'sin-soporte';

export const hoy = () => new Date().toLocaleDateString('en-CA');

export function leerDecision(): Decision | null {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Decision | null;
    return d && (d.r === 'si' || d.r === 'no') ? d : null;
  } catch {
    return null;
  }
}

export function guardarDecision(d: Decision) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(d));
  } catch {
    // Sin almacenamiento se vuelve a preguntar la próxima vez; nada más.
  }
}

export function puedeUbicar(): boolean {
  return window.isSecureContext && 'geolocation' in navigator;
}

export async function permiso(): Promise<PermissionState | null> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return p?.state ?? null;
  } catch {
    return null;
  }
}

/**
 * Pide la ubicación al navegador. Si la da, cuenta la zona y abre los
 * anuncios; si la niega, se anota y se cierran.
 */
export function ubicar(): Promise<'ok' | 'negada' | 'fallo'> {
  return new Promise((resolver) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        contarZona(pos.coords.latitude, pos.coords.longitude);
        guardarDecision({ r: 'si', t: Date.now(), e: hoy() });
        abrirAnuncios();
        resolver('ok');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          guardarDecision({ r: 'no', t: Date.now() });
          cerrarAnuncios();
          resolver('negada');
        } else {
          resolver('fallo');
        }
      },
      { enableHighAccuracy: false, maximumAge: 6 * 60 * 60 * 1000, timeout: 20000 },
    );
  });
}

/** Solo rutas internas de anuncios o iglesias: nada de saltar a otro sitio. */
export function destinoSeguro(ruta: string | null): string | null {
  if (!ruta || !ruta.startsWith('/') || ruta.startsWith('//')) return null;
  return /^\/(announcements|churches)(\/[\w-]*)?$/.test(ruta) ? ruta : null;
}
