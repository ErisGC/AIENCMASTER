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
