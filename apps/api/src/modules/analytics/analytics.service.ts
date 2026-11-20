import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { createHmac } from "node:crypto";
import { DataSource } from "typeorm";

import {
  GrupoConteo,
  NO_HUMANO,
  TIPOS_CONTEO,
  ZERO_UUID,
  diaBogota,
  validarConteo,
} from "./analytics.kinds";

/** Una misma persona viendo lo mismo varias veces seguidas cuenta una vez. */
const VENTANA_REPETIDO_MS = 30 * 60 * 1000;
/** Lo más largo que se puede consultar de una vez. */
const MAX_DIAS = 366;
/** Las huellas de visitantes se guardan algo más de un año. */
const RETENCION_VISITANTES_DIAS = 400;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function sumarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly vistos = new Map<string, number>();
  private ultimaLimpieza = "";

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /* ── Conteo público ── */

  /**
   * Suma uno a lo que el navegador dice que se vio o descargó. Ignora en
   * silencio lo que no es de una persona o no está en la lista.
   */
  async registrar(raw: unknown, userAgent: string | undefined, ip: string | null) {
    const ua = (userAgent ?? "").trim();
    if (!ua || NO_HUMANO.test(ua)) return false;
    const conteo = validarConteo(raw);
    if (!conteo) return false;

    const ahora = Date.now();
    const quien = conteo.visitante ?? `ip:${ip ?? "?"}`;
    const clave = `${quien}|${conteo.tipo}|${conteo.objetivo}`;
    const antes = this.vistos.get(clave);
    if (antes && ahora - antes < VENTANA_REPETIDO_MS) return false;
    this.vistos.set(clave, ahora);
    if (this.vistos.size > 20_000) this.olvidarViejos(ahora);

    const dia = diaBogota();
    await this.db.query(
      `INSERT INTO analytics_daily (day, kind, "targetId", count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (day, kind, "targetId")
       DO UPDATE SET count = analytics_daily.count + 1`,
      [dia, conteo.tipo, conteo.objetivo],
    );

    if (conteo.visitante && TIPOS_CONTEO[conteo.tipo].grupo === "visita") {
      const huella = createHmac(
        "sha256",
        process.env.ADMIN_SESSION_SECRET ?? "aienc",
      )
        .update(`${dia}|${conteo.visitante}`)
        .digest("base64url")
        .slice(0, 32);
      await this.db.query(
        `INSERT INTO analytics_visitors (day, "visitorHash") VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [dia, huella],
      );
    }

    if (this.ultimaLimpieza !== dia) {
      this.ultimaLimpieza = dia;
      await this.db
        .query(`DELETE FROM analytics_visitors WHERE day < $1`, [
          sumarDias(dia, -RETENCION_VISITANTES_DIAS),
        ])
        .catch((e: unknown) => this.logger.warn(`Limpieza: ${String(e)}`));
    }
    return true;
  }

  private olvidarViejos(ahora: number) {
    for (const [k, t] of this.vistos) {
      if (ahora - t >= VENTANA_REPETIDO_MS) this.vistos.delete(k);
    }
  }

  /* ── Reporte para la cuenta principal ── */

  rango(desde?: string, hasta?: string) {
    const hoy = diaBogota();
    let fin = hasta && DIA.test(hasta) ? hasta : hoy;
    if (fin > hoy) fin = hoy;
    let inicio = desde && DIA.test(desde) ? desde : sumarDias(fin, -29);
    if (inicio > fin) inicio = fin;
    if (diasEntre(inicio, fin) >= MAX_DIAS) inicio = sumarDias(fin, -(MAX_DIAS - 1));
    const dias: string[] = [];
    for (let d = inicio; d <= fin; d = sumarDias(d, 1)) dias.push(d);
    return { inicio, fin, dias };
  }

  async reporte(desde?: string, hasta?: string) {
    const { inicio, fin, dias } = this.rango(desde, hasta);
    const [publico, panel] = await Promise.all([
      this.publico(inicio, fin, dias),
      this.panel(inicio, fin, dias),
    ]);
    return { from: inicio, to: fin, publico, panel };
  }

  private async publico(inicio: string, fin: string, dias: string[]) {
    const porDia = (await this.db.query(
      `SELECT day::text AS dia, kind, SUM(count)::int AS n
         FROM analytics_daily
        WHERE day BETWEEN $1 AND $2
        GROUP BY day, kind`,
      [inicio, fin],
    )) as Array<{ dia: string; kind: string; n: number }>;
    const visitantes = (await this.db.query(
      `SELECT day::text AS dia, COUNT(*)::int AS n
         FROM analytics_visitors
        WHERE day BETWEEN $1 AND $2
        GROUP BY day`,
      [inicio, fin],
    )) as Array<{ dia: string; n: number }>;
    const porObjetivo = (await this.db.query(
      `SELECT kind, "targetId" AS objetivo, SUM(count)::int AS n
         FROM analytics_daily
        WHERE day BETWEEN $1 AND $2 AND "targetId" <> $3
        GROUP BY kind, "targetId"`,
      [inicio, fin, ZERO_UUID],
    )) as Array<{ kind: string; objetivo: string; n: number }>;

    const vacio = () => ({ visitas: 0, visitantes: 0, descargas: 0, reproducciones: 0 });
    const serie = new Map(dias.map((d) => [d, { dia: d, ...vacio() }]));
    const secciones = new Map<string, number>();
    const totales = { visitas: 0, descargas: 0, reproducciones: 0, apk: 0 };
    const campo: Record<GrupoConteo, "visitas" | "descargas" | "reproducciones"> = {
      visita: "visitas",
      descarga: "descargas",
      reproduccion: "reproducciones",
    };
    for (const f of porDia) {
      const def = TIPOS_CONTEO[f.kind];
      if (!def) continue;
      const fila = serie.get(f.dia);
      if (fila) fila[campo[def.grupo]] += f.n;
      totales[campo[def.grupo]] += f.n;
      if (f.kind === "apk") totales.apk += f.n;
      secciones.set(f.kind, (secciones.get(f.kind) ?? 0) + f.n);
    }
    let sumaVisitantes = 0;
    let maxVisitantes = 0;
    for (const v of visitantes) {
      const fila = serie.get(v.dia);
      if (fila) fila.visitantes = v.n;
      sumaVisitantes += v.n;
      maxVisitantes = Math.max(maxVisitantes, v.n);
    }

    // Nombres de lo contado: anuncios, iglesias y estudios.
    const ids = (k: string[]) => [
      ...new Set(porObjetivo.filter((p) => k.includes(p.kind)).map((p) => p.objetivo)),
    ];
    const idsAnuncios = ids(["anuncio", "descarga_anuncio", "video_anuncio"]);
    const idsEstudios = ids(["estudio"]);
    const estudios = idsEstudios.length
      ? ((await this.db.query(
          `SELECT s.id, s.topic AS titulo, s."churchId" AS iglesia, c.name AS nombre
             FROM church_studies s LEFT JOIN churches c ON c.id = s."churchId"
            WHERE s.id = ANY($1)`,
          [idsEstudios],
        )) as Array<{ id: string; titulo: string; iglesia: string; nombre: string | null }>)
      : [];
    const idsIglesias = [
      ...new Set([...ids(["iglesia", "descarga_iglesia"]), ...estudios.map((e) => e.iglesia)]),
    ];
    const anuncios = idsAnuncios.length
      ? ((await this.db.query(`SELECT id, title FROM announcements WHERE id = ANY($1)`, [
          idsAnuncios,
        ])) as Array<{ id: string; title: string }>)
      : [];
    const iglesias = idsIglesias.length
      ? ((await this.db.query(`SELECT id, name FROM churches WHERE id = ANY($1)`, [
          idsIglesias,
        ])) as Array<{ id: string; name: string }>)
      : [];

    const n = (k: string, id: string) =>
      porObjetivo.find((p) => p.kind === k && p.objetivo === id)?.n ?? 0;
    const tituloAnuncio = new Map(anuncios.map((a) => [a.id, a.title]));
    const nombreIglesia = new Map(iglesias.map((c) => [c.id, c.name]));

    const topAnuncios = idsAnuncios
      .map((id) => ({
        id,
        titulo: tituloAnuncio.get(id) ?? "Anuncio eliminado",
        vistas: n("anuncio", id),
        descargas: n("descarga_anuncio", id),
        reproducciones: n("video_anuncio", id),
      }))
      .sort((a, b) => b.vistas + b.descargas - (a.vistas + a.descargas))
      .slice(0, 10);

    const topEstudios = estudios
      .map((e) => ({
        id: e.id,
        titulo: e.titulo,
        iglesia: e.nombre ?? "",
        reproducciones: n("estudio", e.id),
      }))
      .sort((a, b) => b.reproducciones - a.reproducciones)
      .slice(0, 10);

    const playsPorIglesia = new Map<string, number>();
    for (const e of estudios) {
      playsPorIglesia.set(e.iglesia, (playsPorIglesia.get(e.iglesia) ?? 0) + n("estudio", e.id));
    }
    const topIglesias = idsIglesias
      .map((id) => ({
        id,
        nombre: nombreIglesia.get(id) ?? "Iglesia eliminada",
        vistas: n("iglesia", id),
        descargas: n("descarga_iglesia", id),
        reproducciones: playsPorIglesia.get(id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.vistas + b.descargas + b.reproducciones -
          (a.vistas + a.descargas + a.reproducciones),
      )
      .slice(0, 10);

    // El promedio se toma desde el primer día con datos: si el conteo empezó
    // hace poco, los días anteriores (en cero) no deben bajarlo.
    const filasSerie = [...serie.values()];
    const primero = filasSerie.findIndex(
      (f) => f.visitas + f.visitantes + f.descargas + f.reproducciones > 0,
    );
    const diasConDatos = primero < 0 ? 0 : filasSerie.length - primero;
    return {
      totales: {
        ...totales,
        visitantesPromedio: diasConDatos ? Math.round(sumaVisitantes / diasConDatos) : 0,
        visitantesMax: maxVisitantes,
      },
      serie: filasSerie,
      secciones: Object.entries(TIPOS_CONTEO)
        .map(([clave, def]) => ({
          clave,
          etiqueta: def.etiqueta,
          grupo: def.grupo,
          total: secciones.get(clave) ?? 0,
        }))
        .sort((a, b) => b.total - a.total),
      anuncios: topAnuncios,
      iglesias: topIglesias,
      estudios: topEstudios,
    };
  }

  /** Actividad del panel, sacada de lo que ya se guarda. */
  private async panel(inicio: string, fin: string, dias: string[]) {
    const desde = `($1::date)::timestamp AT TIME ZONE 'America/Bogota'`;
    const hasta = `($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota'`;
    const dia = `("createdAt" AT TIME ZONE 'America/Bogota')::date::text`;
    const consultas: Record<string, string> = {
      // Un ingreso es un inicio de sesión que quedó activo: directo, o
      // aprobado después (con el número en la app o por la principal).
      ingresos: `SELECT ${dia} AS dia, COUNT(*)::int AS n FROM admin_action_logs
                  WHERE "actionType" IN ('LOGIN_SUCCEEDED', 'LOGIN_SUCCEEDED_DEVICE_VERIFICATION_DISABLED',
                                         'ACCESS_REQUEST_APPROVED', 'ACCESS_REQUEST_APPROVED_BY_APP',
                                         'ROOT_BOOTSTRAPPED')
                    AND "createdAt" >= ${desde} AND "createdAt" < ${hasta} GROUP BY 1`,
      fallidos: `SELECT ${dia} AS dia, COUNT(*)::int AS n FROM admin_action_logs
                  WHERE "actionType" IN ('LOGIN_FAILED', 'LOGIN_BLOCKED_INACTIVE_ACCOUNT',
                                         'LOGIN_BLOCKED_DEVICE_CONFLICT', 'ACCESS_REQUEST_CODE_MISMATCH')
                    AND "createdAt" >= ${desde} AND "createdAt" < ${hasta} GROUP BY 1`,
      informes: `SELECT ${dia} AS dia, COUNT(*)::int AS n FROM reports
                  WHERE "createdAt" >= ${desde} AND "createdAt" < ${hasta} GROUP BY 1`,
      anuncios: `SELECT dia, SUM(n)::int AS n FROM (
                    SELECT ${dia} AS dia, COUNT(*) AS n FROM announcements
                     WHERE "createdAt" >= ${desde} AND "createdAt" < ${hasta} GROUP BY 1
                    UNION ALL
                    SELECT ${dia} AS dia, COUNT(*) AS n FROM church_announcements
                     WHERE "createdAt" >= ${desde} AND "createdAt" < ${hasta} GROUP BY 1
                  ) x GROUP BY dia`,
      eventos: `SELECT ${dia} AS dia, COUNT(DISTINCT COALESCE("seriesId", id))::int AS n FROM events
                  WHERE "createdAt" >= ${desde} AND "createdAt" < ${hasta} GROUP BY 1`,
      mensajes: `SELECT ${dia} AS dia, COUNT(*)::int AS n FROM support_messages
                  WHERE "senderKind" = 'AUTHOR'
                    AND "createdAt" >= ${desde} AND "createdAt" < ${hasta} GROUP BY 1`,
    };
    const claves = Object.keys(consultas) as Array<
      "ingresos" | "fallidos" | "informes" | "anuncios" | "eventos" | "mensajes"
    >;
    const resultados = await Promise.all(
      claves.map((k) =>
        this.db
          .query(consultas[k], [inicio, fin])
          .then((r: Array<{ dia: string; n: number }>) => r)
          .catch((e: unknown) => {
            this.logger.warn(`Actividad ${k}: ${String(e)}`);
            return [] as Array<{ dia: string; n: number }>;
          }),
      ),
    );
    const serie = new Map(
      dias.map((d) => [
        d,
        { dia: d, ingresos: 0, fallidos: 0, informes: 0, anuncios: 0, eventos: 0, mensajes: 0 },
      ]),
    );
    const totales = { ingresos: 0, fallidos: 0, informes: 0, anuncios: 0, eventos: 0, mensajes: 0 };
    claves.forEach((k, i) => {
      for (const f of resultados[i]) {
        const fila = serie.get(f.dia);
        if (fila) fila[k] += f.n;
        totales[k] += f.n;
      }
    });
    return { totales, serie: [...serie.values()] };
  }
}
