'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { abrirAnuncios } from '@/app/lib/zona-cookie';

import { contarPagina, esNavegadorDeAdministrador } from './Medidor';
import { guardarDecision, type Motivo, permiso, puedeUbicar, ubicar } from './ubicacion';
import styles from './PuertaUbicacion.module.css';

/**
 * Lo que se ve en lugar de los anuncios mientras la persona no comparte su
 * zona. Si el navegador ya tiene el permiso, se ubica sin preguntar y el
 * anuncio se abre solo. Si no lo da:
 * - en las páginas de anuncios, vuelve al inicio con el aviso de por qué;
 * - en la página de una iglesia, la sección de anuncios queda cerrada y el
 *   resto de la página se sigue viendo.
 */

type Fase = 'revisando' | 'pregunta' | 'buscando' | 'fallo' | Motivo;

const TITULOS = {
  anuncio: 'Comparte tu zona para abrir este anuncio',
  anuncios: 'Comparte tu zona para ver los anuncios',
  iglesia: 'Comparte tu zona para ver los anuncios de esta iglesia',
};

export function PuertaUbicacion({ que }: { que: keyof typeof TITULOS }) {
  const router = useRouter();
  const pathname = usePathname();
  const [fase, setFase] = useState<Fase>('revisando');
  const enLinea = que === 'iglesia';

  const negar = useCallback(
    (motivo: Motivo) => {
      if (enLinea) {
        setFase(motivo);
        return;
      }
      // Carga completa del inicio: el aviso que explica el motivo lee la
      // dirección al montarse, y en una navegación interna ya está montado.
      const volver = encodeURIComponent(pathname ?? '/announcements');
      window.location.replace(`/?ubicacion=${motivo}&volver=${volver}`);
    },
    [enLinea, pathname],
  );

  const intentar = useCallback(async () => {
    setFase('buscando');
    const r = await ubicar();
    if (r === 'ok') {
      contarPagina(pathname ?? '');
      router.refresh();
    } else if (r === 'negada') {
      // Cerrar el cuadro del navegador no es lo mismo que bloquear el sitio.
      negar((await permiso()) === 'denied' ? 'bloqueada' : 'negada');
    } else {
      setFase('fallo');
    }
  }, [negar, pathname, router]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      // El equipo de un administrador no se cuenta ni se ubica.
      if (esNavegadorDeAdministrador()) {
        abrirAnuncios();
        router.refresh();
        return;
      }
      if (!puedeUbicar()) return negar('sin-soporte');
      const estado = await permiso();
      if (!vivo) return;
      if (estado === 'denied') return negar('bloqueada');
      if (estado === 'granted') return intentar();
      setFase('pregunta');
    })();
    return () => {
      vivo = false;
    };
    // Solo al llegar a la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contenido = (
    <div className={enLinea ? styles.seccion : styles.tarjeta} data-puerta-zona>
      <span className={styles.icono} aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
      </span>

      {fase === 'negada' || fase === 'bloqueada' || fase === 'sin-soporte' ? (
        <>
          <h2 className={styles.titulo}>Sin compartir tu ubicación no puedes ver los anuncios</h2>
          <p className={styles.texto}>
            {fase === 'sin-soporte'
              ? 'Este navegador no permite compartir la ubicación. Abre la página en Chrome, Safari o Firefox para verlos.'
              : fase === 'bloqueada'
                ? 'Tu navegador tiene la ubicación bloqueada para este sitio. Toca el candado o el ícono junto a la dirección de la página, entra a los permisos y permite la ubicación.'
                : 'Cuando quieras verlos, comparte tu zona aproximada.'}
          </p>
          {fase !== 'sin-soporte' && (
            <div className={styles.acciones}>
              <button type="button" className={styles.si} onClick={() => void intentar()}>
                {fase === 'bloqueada' ? 'Ya la permití, intentar de nuevo' : 'Compartir mi zona'}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <h2 className={styles.titulo}>{TITULOS[que]}</h2>
          <p className={styles.texto}>
            Los anuncios solo se abren para quienes comparten desde qué zona nos visitan. Guardamos
            únicamente la zona aproximada (unos 10 km a la redonda), nunca tu ubicación exacta, tu
            nombre ni tu dirección.
          </p>

          {fase === 'pregunta' && (
            <div className={styles.acciones}>
              <button type="button" className={styles.si} onClick={() => void intentar()}>
                Compartir mi zona
              </button>
              {!enLinea && (
                <button
                  type="button"
                  className={styles.no}
                  onClick={() => {
                    guardarDecision({ r: 'no', t: Date.now() });
                    negar('negada');
                  }}
                >
                  No, volver al inicio
                </button>
              )}
            </div>
          )}

          {fase === 'fallo' && (
            <>
              <p className={styles.error} role="alert">
                No pudimos saber tu ubicación. Revisa que la ubicación del teléfono esté encendida
                e inténtalo de nuevo.
              </p>
              <div className={styles.acciones}>
                <button type="button" className={styles.si} onClick={() => void intentar()}>
                  Intentar de nuevo
                </button>
                {!enLinea && (
                  <button type="button" className={styles.no} onClick={() => router.push('/')}>
                    Volver al inicio
                  </button>
                )}
              </div>
            </>
          )}

          {(fase === 'revisando' || fase === 'buscando') && (
            <p className={styles.espera} role="status">
              {fase === 'buscando' ? 'Buscando tu zona…' : 'Un momento…'}
            </p>
          )}
        </>
      )}
    </div>
  );

  return enLinea ? contenido : <main className={styles.pagina}>{contenido}</main>;
}
