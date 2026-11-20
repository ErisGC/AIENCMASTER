/**
 * Lo que se cuenta en el portal público. Solo se aceptan estas claves: lo
 * demás se ignora en silencio (no se guarda nada que no esté aquí).
 *
 *  - `objetivo`: si el conteo es de algo concreto (un anuncio, una iglesia,
 *    un estudio). Sin objetivo se guarda con el UUID cero.
 *  - `grupo`: cómo se suma en el reporte.
 */
export const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export type GrupoConteo = "visita" | "descarga" | "reproduccion";

export interface TipoConteo {
  etiqueta: string;
  objetivo: boolean;
  grupo: GrupoConteo;
}

export const TIPOS_CONTEO: Record<string, TipoConteo> = {
  inicio: { etiqueta: "Inicio", objetivo: false, grupo: "visita" },
  anuncios: { etiqueta: "Lista de anuncios", objetivo: false, grupo: "visita" },
  anuncio: { etiqueta: "Anuncios abiertos", objetivo: true, grupo: "visita" },
  iglesias: { etiqueta: "Lista de iglesias", objetivo: false, grupo: "visita" },
  iglesia: { etiqueta: "Páginas de iglesia", objetivo: true, grupo: "visita" },
  eventos: { etiqueta: "Cronograma", objetivo: false, grupo: "visita" },
  info: { etiqueta: "Información", objetivo: false, grupo: "visita" },
  descargar: { etiqueta: "Página de descarga", objetivo: false, grupo: "visita" },
  descarga_anuncio: {
    etiqueta: "Archivos de anuncios",
    objetivo: true,
    grupo: "descarga",
  },
  descarga_iglesia: {
    etiqueta: "Archivos de iglesias",
    objetivo: true,
    grupo: "descarga",
  },
  apk: { etiqueta: "Descargas de la app", objetivo: false, grupo: "descarga" },
  estudio: { etiqueta: "Estudios escuchados", objetivo: true, grupo: "reproduccion" },
  video_anuncio: {
    etiqueta: "Videos de anuncios",
    objetivo: true,
    grupo: "reproduccion",
  },
};

/** Robots, vistas previas de enlaces y herramientas: no son visitas. */
export const NO_HUMANO =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|skype|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|axios|node-fetch|go-http/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITANTE = /^[A-Za-z0-9_-]{8,64}$/;

export interface ConteoValido {
  tipo: string;
  objetivo: string;
  visitante: string | null;
}

/**
 * Valida lo que manda el navegador ({k, t, v}). Devuelve null si no es algo
 * que se cuente; nunca lanza, para que un envío raro no deje rastro de error.
 */
export function validarConteo(raw: unknown): ConteoValido | null {
  let body: unknown = raw;
  if (typeof raw === "string") {
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const tipo = typeof b.k === "string" ? b.k : "";
  const def = TIPOS_CONTEO[tipo];
  if (!def) return null;
  let objetivo = ZERO_UUID;
  if (def.objetivo) {
    if (typeof b.t !== "string" || !UUID.test(b.t)) return null;
    objetivo = b.t.toLowerCase();
  }
  const visitante =
    typeof b.v === "string" && VISITANTE.test(b.v) ? b.v : null;
  return { tipo, objetivo, visitante };
}

/** Día calendario en Colombia ("AAAA-MM-DD"). */
export function diaBogota(fecha = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}
