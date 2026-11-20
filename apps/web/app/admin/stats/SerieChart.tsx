'use client';

import { useId, useMemo, useState } from 'react';

import styles from './stats.module.css';

export interface Serie {
  clave: string;
  etiqueta: string;
  color: string;
  /** Rellena el área bajo la línea (para la serie principal). */
  area?: boolean;
}

interface Props<T extends { dia: string }> {
  datos: T[];
  series: Serie[];
  titulo: string;
  alto?: number;
}

const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });

/** "19 nov" */
function etiquetaDia(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${d.getUTCDate()} ${fmtMes.format(d).replace('.', '')}`;
}

/**
 * Gráfico de líneas por día. La leyenda permite ocultar o mostrar cada serie
 * y al pasar el cursor (o tocar) se ven los números de ese día.
 */
export function SerieChart<T extends { dia: string }>({ datos, series, titulo, alto = 240 }: Props<T>) {
  const gradId = useId().replace(/:/g, '');
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<number | null>(null);

  const visibles = series.filter((s) => !ocultas.has(s.clave));
  const ancho = 720;
  const pad = { top: 16, right: 14, bottom: 30, left: 40 };
  const innerW = ancho - pad.left - pad.right;
  const innerH = alto - pad.top - pad.bottom;
  const valor = (fila: T, clave: string) => Number((fila as Record<string, unknown>)[clave] ?? 0);

  // Cuatro marcas enteras en el eje: el techo es un múltiplo de 4 pasos.
  const paso = useMemo(() => {
    let m = 1;
    for (const f of datos) for (const s of visibles) m = Math.max(m, valor(f, s.clave));
    const crudo = Math.max(1, Math.ceil(m / 4));
    const base = Math.pow(10, Math.floor(Math.log10(crudo)));
    const redondo = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
      .map((k) => k * base)
      .find((v) => v >= crudo && Number.isInteger(v));
    return redondo ?? crudo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, ocultas]);
  const max = paso * 4;

  const n = datos.length;
  const x = (i: number) => pad.left + (n > 1 ? (innerW * i) / (n - 1) : innerW / 2);
  const y = (v: number) => pad.top + innerH * (1 - v / max);

  const linea = (clave: string) =>
    datos.map((f, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(valor(f, clave)).toFixed(1)}`).join(' ');

  // Unas seis fechas en el eje, repartidas.
  const marcas = n <= 1 ? [0] : Array.from(new Set(Array.from({ length: 6 }, (_, k) => Math.round((k * (n - 1)) / 5))));

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ancho;
    const i = n > 1 ? Math.round(((px - pad.left) / innerW) * (n - 1)) : 0;
    setFoco(Math.min(n - 1, Math.max(0, i)));
  };

  const filaFoco = foco !== null ? datos[foco] : null;

  return (
    <div className={styles.chartBox}>
      <div className={styles.legendRow}>
        {series.map((s) => {
          const apagada = ocultas.has(s.clave);
          return (
            <button
              key={s.clave}
              type="button"
              className={`${styles.legendBtn} ${apagada ? styles.legendOff : ''}`}
              onClick={() =>
                setOcultas((prev) => {
                  const nuevo = new Set(prev);
                  if (nuevo.has(s.clave)) nuevo.delete(s.clave);
                  else if (series.length - nuevo.size > 1) nuevo.add(s.clave);
                  return nuevo;
                })
              }
              aria-pressed={!apagada}
            >
              <span className={styles.legendDot} style={{ background: s.color }} />
              {s.etiqueta}
            </button>
          );
        })}
      </div>

      <div className={styles.chartArea}>
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          width="100%"
          className={styles.chartSvg}
          role="img"
          aria-label={titulo}
          onPointerMove={alMover}
          onPointerLeave={() => setFoco(null)}
        >
          <defs>
            {visibles
              .filter((s) => s.area)
              .map((s) => (
                <linearGradient key={s.clave} id={`${gradId}-${s.clave}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
          </defs>

          {Array.from({ length: 5 }, (_, i) => {
            const v = paso * i;
            return (
              <g key={i}>
                <line x1={pad.left} x2={pad.left + innerW} y1={y(v)} y2={y(v)} stroke="var(--border-soft)" />
                <text x={pad.left - 6} y={y(v) + 4} fontSize={10} textAnchor="end" fill="var(--text-muted)">
                  {v.toLocaleString('es-CO')}
                </text>
              </g>
            );
          })}

          {marcas.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={alto - 8}
              fontSize={10.5}
              textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
              fill="var(--text-muted)"
            >
              {datos[i] ? etiquetaDia(datos[i].dia) : ''}
            </text>
          ))}

          {visibles.map((s) =>
            s.area && n > 1 ? (
              <path
                key={`a-${s.clave}`}
                d={`${linea(s.clave)} L ${x(n - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`}
                fill={`url(#${gradId}-${s.clave})`}
              />
            ) : null,
          )}
          {visibles.map((s) => (
            <path
              key={s.clave}
              d={linea(s.clave)}
              fill="none"
              stroke={s.color}
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {n === 1 &&
            visibles.map((s) => (
              <circle key={`p-${s.clave}`} cx={x(0)} cy={y(valor(datos[0], s.clave))} r={4} fill={s.color} />
            ))}

          {filaFoco && foco !== null && (
            <g>
              <line x1={x(foco)} x2={x(foco)} y1={pad.top} y2={pad.top + innerH} stroke="var(--text-muted)" strokeDasharray="3 3" />
              {visibles.map((s) => (
                <circle key={`f-${s.clave}`} cx={x(foco)} cy={y(valor(filaFoco, s.clave))} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={1.5} />
              ))}
            </g>
          )}
        </svg>

        {filaFoco && foco !== null && (
          <div
            className={styles.tooltip}
            style={{ left: `${Math.min(80, Math.max(4, (x(foco) / ancho) * 100))}%` }}
            role="status"
          >
            <strong>{etiquetaDia(filaFoco.dia)}</strong>
            {visibles.map((s) => (
              <span key={s.clave}>
                <span className={styles.legendDot} style={{ background: s.color }} />
                {s.etiqueta}: {valor(filaFoco, s.clave).toLocaleString('es-CO')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
