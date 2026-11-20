import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

/** Nominatim pide como mucho una consulta por segundo. */
const PAUSA_MS = 1200;
/** Si la consulta falla, se repite al día siguiente. */
const REINTENTO_MS = 24 * 60 * 60 * 1000;
const TOPE_COLA = 200;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DireccionNominatim {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
}

/**
 * Pone nombre a cada zona del mapa (ciudad, departamento y país) con el
 * buscador inverso de OpenStreetMap. Solo se le manda el centro de la celda,
 * que ya está redondeado a unos 11 km: nada de quien visita. Cada zona se
 * consulta una sola vez y el nombre queda guardado.
 */
@Injectable()
export class LugaresService {
  private readonly logger = new Logger(LugaresService.name);
  private readonly cola: Array<[number, number]> = [];
  private readonly enCola = new Set<string>();
  private trabajando = false;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Registra la zona si es nueva y, en ese caso, pide su nombre. */
  async conocer(lat10: number, lon10: number) {
    const nueva = (await this.db.query(
      `INSERT INTO analytics_places (lat10, lon10) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING lat10`,
      [lat10, lon10],
    )) as unknown[];
    if (nueva.length) this.pedir(lat10, lon10);
  }

  /** Vuelve a pedir las zonas sin nombre (nunca consultadas o que fallaron). */
  pendientes(zonas: Array<{ lat10: number; lon10: number; resolvedAt: Date | null; ok: boolean }>) {
    const ahora = Date.now();
    for (const z of zonas) {
      const fallo = z.resolvedAt && !z.ok && ahora - new Date(z.resolvedAt).getTime() > REINTENTO_MS;
      if (!z.resolvedAt || fallo) this.pedir(z.lat10, z.lon10);
    }
  }

  private pedir(lat10: number, lon10: number) {
    if (process.env.ANALYTICS_GEOCODER === "off") return;
    const clave = `${lat10},${lon10}`;
    if (this.enCola.has(clave) || this.cola.length >= TOPE_COLA) return;
    this.enCola.add(clave);
    this.cola.push([lat10, lon10]);
    if (!this.trabajando) void this.procesar();
  }

  private async procesar() {
    this.trabajando = true;
    try {
      while (this.cola.length) {
        const [lat10, lon10] = this.cola.shift()!;
        try {
          await this.resolver(lat10, lon10);
        } catch (e) {
          this.logger.warn(`Nombre de zona ${lat10},${lon10}: ${String(e)}`);
          await this.db
            .query(
              `UPDATE analytics_places SET "resolvedAt" = now(), ok = false
                WHERE lat10 = $1 AND lon10 = $2`,
              [lat10, lon10],
            )
            .catch(() => undefined);
        } finally {
          this.enCola.delete(`${lat10},${lon10}`);
        }
        await esperar(PAUSA_MS);
      }
    } finally {
      this.trabajando = false;
    }
  }

  private async resolver(lat10: number, lon10: number) {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10` +
      `&lat=${(lat10 / 10).toFixed(1)}&lon=${(lon10 / 10).toFixed(1)}&accept-language=es`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "AIENC-portal/1.0 (+https://aienc.org)",
        Referer: "https://aienc.org",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const datos = (await res.json()) as { address?: DireccionNominatim; error?: string };
    // En el mar o en una zona sin nombre Nominatim responde "error": la zona
    // queda consultada, sin nombre, y no se vuelve a pedir.
    const d = datos.address ?? {};
    const ciudad =
      d.city || d.town || d.village || d.municipality || d.county || d.state_district || null;
    await this.db.query(
      `UPDATE analytics_places
          SET city = $3, region = $4, country = $5, "countryCode" = $6,
              "resolvedAt" = now(), ok = true
        WHERE lat10 = $1 AND lon10 = $2`,
      [
        lat10,
        lon10,
        ciudad,
        d.state || d.region || null,
        d.country || null,
        d.country_code?.toLowerCase() || null,
      ],
    );
  }
}
