'use client';

import { useCallback, useEffect, useState } from 'react';

import { adminGetStats, type StatsReport } from '@/app/lib/admin-stats';

import base from '../dashboard/page.module.css';
import { SerieChart } from './SerieChart';
import styles from './stats.module.css';

type Rango = '7' | '30' | '90' | '365' | 'propio';

const RANGOS: Array<{ clave: Rango; etiqueta: string }> = [
  { clave: '7', etiqueta: '7 días' },
  { clave: '30', etiqueta: '30 días' },
  { clave: '90', etiqueta: '3 meses' },
  { clave: '365', etiqueta: '12 meses' },
];

/** Hoy en Colombia (AAAA-MM-DD). */
function hoyColombia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function restarDias(dia: string, n: number) {
  const [y, m, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

const num = (n: number) => n.toLocaleString('es-CO');

/** "1 audio", "3 audios". */
const cuenta = (n: number, uno: string, varios: string) => `${num(n)} ${n === 1 ? uno : varios}`;

function Kpi({ etiqueta, valor, sub, tono }: { etiqueta: string; valor: string; sub?: string; tono: string }) {
  return (
    <div className={`${base.kpi} ${styles[tono] ?? ''}`}>
      <span className={base.kpiLabel}>{etiqueta}</span>
      <span className={base.kpiValue}>{valor}</span>
      {sub && <span className={base.kpiSub}>{sub}</span>}
    </div>
  );
}

function Barras({ filas }: { filas: Array<{ etiqueta: string; total: number; detalle?: string }> }) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <ul className={styles.bars}>
      {filas.map((f) => (
        <li key={f.etiqueta + (f.detalle ?? '')}>
          <div className={styles.barTop}>
            <span className={styles.barLabel}>
              {f.etiqueta}
              {f.detalle && <small>{f.detalle}</small>}
            </span>
            <span className={styles.barValue}>{num(f.total)}</span>
          </div>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${(f.total / max) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Estadísticas de uso para la cuenta principal: cómo se usa el portal público
 * (visitas, descargas, audios) y cuánto se trabaja en el panel.
 */
export function StatsClient() {
  const hoy = hoyColombia();
  const [rango, setRango] = useState<Rango>('30');
  const [desde, setDesde] = useState(restarDias(hoy, 29));
  const [hasta, setHasta] = useState(hoy);
  const [datos, setDatos] = useState<StatsReport | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await adminGetStats(d, h));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(desde, hasta);
  }, [cargar, desde, hasta]);

  function elegir(r: Rango) {
    setRango(r);
    if (r === 'propio') return;
    setDesde(restarDias(hoy, Number(r) - 1));
    setHasta(hoy);
  }

  const p = datos?.publico;
  const a = datos?.panel;
  const sinVisitas = p ? p.totales.visitas + p.totales.descargas + p.totales.reproducciones === 0 : false;

  return (
    <div className={base.page}>
      <header className={base.header}>
        <div>
          <h1 className={base.title}>Estadísticas</h1>
          <p className={base.subtitle}>
            Cómo se usa el portal y cuánto se trabaja en el panel. Solo lo ve la cuenta principal. Las
            visitas son anónimas: no se guarda quién entra, solo cuántas veces.
          </p>
        </div>
        <div className={styles.rangeBar}>
          <div className={styles.segmented} role="group" aria-label="Periodo">
            {RANGOS.map((r) => (
              <button
                key={r.clave}
                type="button"
                className={rango === r.clave ? styles.segOn : ''}
                aria-pressed={rango === r.clave}
                onClick={() => elegir(r.clave)}
              >
                {r.etiqueta}
              </button>
            ))}
          </div>
          <div className={base.filters}>
            <div className={base.filterGroup}>
              <label htmlFor="st-desde">Desde</label>
              <input
                id="st-desde"
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => {
                  setRango('propio');
                  setDesde(e.target.value);
                }}
              />
            </div>
            <div className={base.filterGroup}>
              <label htmlFor="st-hasta">Hasta</label>
              <input
                id="st-hasta"
                type="date"
                value={hasta}
                min={desde}
                max={hoy}
                onChange={(e) => {
                  setRango('propio');
                  setHasta(e.target.value);
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {error && <div className={base.errorBanner}>{error}</div>}
      {cargando && !datos && <p className={styles.loading}>Cargando…</p>}

      {p && a && (
        <div className={`${styles.report} ${cargando ? styles.refreshing : ''}`}>
          <h2 className={styles.sectionTitle}>Portal público</h2>
          {sinVisitas && (
            <p className={styles.hint}>
              Todavía no hay visitas contadas en este periodo. El conteo empezó con esta versión del
              portal; los números aparecen a medida que la gente entra.
            </p>
          )}
          <div className={base.kpiGrid}>
            <Kpi etiqueta="Visitas" valor={num(p.totales.visitas)} sub="Páginas abiertas" tono="tVisitas" />
            <Kpi
              etiqueta="Personas al día"
              valor={num(p.totales.visitantesPromedio)}
              sub={`En promedio · el día con más: ${num(p.totales.visitantesMax)}`}
              tono="tPersonas"
            />
            <Kpi
              etiqueta="Descargas"
              valor={num(p.totales.descargas)}
              sub={`Archivos y app · ${num(p.totales.apk)} de la app`}
              tono="tDescargas"
            />
            <Kpi
              etiqueta="Reproducciones"
              valor={num(p.totales.reproducciones)}
              sub="Estudios en audio y videos"
              tono="tAudios"
            />
          </div>

          <section className={base.chartCard}>
            <div className={base.chartHead}>
              <h3 className={base.chartTitle}>Visitas por día</h3>
            </div>
            <SerieChart
              titulo="Visitas y personas por día"
              datos={p.serie}
              series={[
                { clave: 'visitas', etiqueta: 'Visitas', color: 'var(--gem-sapphire)', area: true },
                { clave: 'visitantes', etiqueta: 'Personas', color: 'var(--gem-emerald)' },
              ]}
            />
          </section>

          <section className={base.chartCard}>
            <div className={base.chartHead}>
              <h3 className={base.chartTitle}>Descargas y reproducciones por día</h3>
            </div>
            <SerieChart
              titulo="Descargas y reproducciones por día"
              datos={p.serie}
              series={[
                { clave: 'descargas', etiqueta: 'Descargas', color: 'var(--gem-topaz)', area: true },
                { clave: 'reproducciones', etiqueta: 'Reproducciones', color: 'var(--gem-amethyst, #7d4cdb)' },
              ]}
            />
          </section>

          <div className={styles.grid2}>
            <section className={base.chartCard}>
              <h3 className={base.chartTitle}>Qué se mira</h3>
              <Barras
                filas={p.secciones
                  .filter((s) => s.total > 0)
                  .map((s) => ({ etiqueta: s.etiqueta, total: s.total }))}
              />
              {p.secciones.every((s) => s.total === 0) && <p className={styles.empty}>Sin datos todavía.</p>}
            </section>

            <section className={base.chartCard}>
              <h3 className={base.chartTitle}>Iglesias más visitadas</h3>
              {p.iglesias.length === 0 ? (
                <p className={styles.empty}>Sin datos todavía.</p>
              ) : (
                <Barras
                  filas={p.iglesias.map((c) => ({
                    etiqueta: c.nombre,
                    total: c.vistas,
                    detalle: [
                      c.descargas ? cuenta(c.descargas, 'descarga', 'descargas') : '',
                      c.reproducciones ? cuenta(c.reproducciones, 'audio escuchado', 'audios escuchados') : '',
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  }))}
                />
              )}
            </section>
          </div>

          <div className={styles.grid2}>
            <section className={base.chartCard}>
              <h3 className={base.chartTitle}>Anuncios más vistos</h3>
              {p.anuncios.length === 0 ? (
                <p className={styles.empty}>Sin datos todavía.</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Anuncio</th>
                      <th>Vistas</th>
                      <th>Descargas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.anuncios.map((x) => (
                      <tr key={x.id}>
                        <td>{x.titulo}</td>
                        <td>{num(x.vistas)}</td>
                        <td>{num(x.descargas + x.reproducciones)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className={base.chartCard}>
              <h3 className={base.chartTitle}>Estudios más escuchados</h3>
              {p.estudios.length === 0 ? (
                <p className={styles.empty}>Sin datos todavía.</p>
              ) : (
                <Barras
                  filas={p.estudios.map((e) => ({
                    etiqueta: e.titulo,
                    total: e.reproducciones,
                    detalle: e.iglesia,
                  }))}
                />
              )}
            </section>
          </div>

          <h2 className={styles.sectionTitle}>Panel administrativo</h2>
          <div className={base.kpiGrid}>
            <Kpi etiqueta="Ingresos al panel" valor={num(a.totales.ingresos)} sub="Web y app" tono="tVisitas" />
            <Kpi
              etiqueta="Intentos fallidos"
              valor={num(a.totales.fallidos)}
              sub="Contraseña o número equivocado, equipo bloqueado"
              tono="tMensajes"
            />
            <Kpi etiqueta="Informes subidos" valor={num(a.totales.informes)} tono="tPersonas" />
            <Kpi etiqueta="Anuncios publicados" valor={num(a.totales.anuncios)} sub="Generales y de iglesias" tono="tDescargas" />
            <Kpi etiqueta="Eventos programados" valor={num(a.totales.eventos)} sub="Una serie cuenta una vez" tono="tAudios" />
            <Kpi etiqueta="Mensajes a soporte" valor={num(a.totales.mensajes)} tono="tMensajes" />
          </div>

          <section className={base.chartCard}>
            <div className={base.chartHead}>
              <h3 className={base.chartTitle}>Actividad del panel por día</h3>
            </div>
            <SerieChart
              titulo="Actividad del panel por día"
              datos={a.serie}
              series={[
                { clave: 'ingresos', etiqueta: 'Ingresos', color: 'var(--gem-sapphire)', area: true },
                { clave: 'informes', etiqueta: 'Informes', color: 'var(--gem-emerald)' },
                { clave: 'anuncios', etiqueta: 'Anuncios', color: 'var(--gem-topaz)' },
                { clave: 'eventos', etiqueta: 'Eventos', color: 'var(--gem-amethyst, #7d4cdb)' },
                { clave: 'mensajes', etiqueta: 'Soporte', color: 'var(--gem-emerald-deep, #0b5f56)' },
                { clave: 'fallidos', etiqueta: 'Intentos fallidos', color: 'var(--danger, #c0392b)' },
              ]}
            />
          </section>
        </div>
      )}
    </div>
  );
}
