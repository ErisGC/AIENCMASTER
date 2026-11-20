import { adminFetch } from './api';

/** Estadísticas de uso para la cuenta principal (ver API admin/stats). */

export interface StatsPublicDay {
  dia: string;
  visitas: number;
  visitantes: number;
  descargas: number;
  reproducciones: number;
}

export interface StatsPanelDay {
  dia: string;
  ingresos: number;
  fallidos: number;
  informes: number;
  anuncios: number;
  eventos: number;
  mensajes: number;
}

/** Zona de unos 11 km desde donde visitaron (solo quien aceptó compartirla). */
export interface StatsLugar {
  lat: number;
  lon: number;
  ciudad: string | null;
  region: string | null;
  pais: string | null;
  codigoPais: string | null;
  personas: number;
}

/**
 * "Valledupar, Cesar" o "Quito, Pichincha (Ecuador)". Si el departamento ya
 * lleva el nombre de la ciudad ("Bogotá ciudad" en "Bogotá, Distrito
 * Capital") se deja solo el departamento, para no repetir.
 */
export function nombreLugar(l: StatsLugar): string {
  const ciudad = l.ciudad?.replace(/\s+ciudad$/i, '') ?? null;
  const repite = ciudad && l.region?.toLowerCase().startsWith(ciudad.toLowerCase());
  const base = (repite ? [l.region] : [ciudad, l.region]).filter(Boolean).join(', ');
  const fuera = l.codigoPais && l.codigoPais !== 'co' && l.pais ? ` (${l.pais})` : '';
  return (base || 'Zona sin nombre todavía') + fuera;
}

export interface StatsReport {
  from: string;
  to: string;
  publico: {
    totales: {
      visitas: number;
      descargas: number;
      reproducciones: number;
      apk: number;
      visitantesPromedio: number;
      visitantesMax: number;
    };
    serie: StatsPublicDay[];
    secciones: Array<{
      clave: string;
      etiqueta: string;
      grupo: 'visita' | 'descarga' | 'reproduccion';
      total: number;
    }>;
    anuncios: Array<{
      id: string;
      titulo: string;
      vistas: number;
      descargas: number;
      reproducciones: number;
    }>;
    iglesias: Array<{
      id: string;
      nombre: string;
      vistas: number;
      descargas: number;
      reproducciones: number;
    }>;
    estudios: Array<{ id: string; titulo: string; iglesia: string; reproducciones: number }>;
  };
  panel: {
    totales: {
      ingresos: number;
      fallidos: number;
      informes: number;
      anuncios: number;
      eventos: number;
      mensajes: number;
    };
    serie: StatsPanelDay[];
  };
  /** Puede faltar si la API todavía no se actualizó. */
  ubicaciones?: { total: number; lugares: StatsLugar[] };
}

export async function adminGetStats(from: string, to: string): Promise<StatsReport> {
  let res: Response;
  try {
    res = await adminFetch(`/admin/stats?from=${from}&to=${to}`, {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new Error('No se pudo contactar el servidor. Revisa tu conexión.');
  }
  if (!res.ok) {
    throw new Error(
      res.status === 403
        ? 'Las estadísticas solo se ven desde un dispositivo de la cuenta principal.'
        : 'No se pudieron cargar las estadísticas.',
    );
  }
  return (await res.json()) as StatsReport;
}
