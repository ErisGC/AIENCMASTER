'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { anunciosAbiertos, cerrarAnuncios } from '@/app/lib/zona-cookie';

import { esNavegadorDeAdministrador } from './Medidor';
import {
  destinoSeguro,
  guardarDecision,
  hoy,
  leerDecision,
  type Motivo,
  permiso,
  puedeUbicar,
  ubicar,
} from './ubicacion';
import styles from './AvisoUbicacion.module.css';

/**
 * Aviso del portal sobre la ubicación. Tiene dos usos:
 *
 * - Pasados unos segundos en cualquier página pública, explica qué se guarda
 *   y pregunta si comparte su zona. Si dice que no, no se vuelve a preguntar
 *   en 90 días (aunque los anuncios seguirán pidiéndola).
 * - Cuando alguien intentó abrir un anuncio sin compartirla, llega al inicio
 *   con `?ubicacion=<motivo>` y aquí se le explica, enseguida, que sin la
 *   ubicación no puede ver los anuncios, con la opción de compartirla.
 *
 * Lo que sale del equipo es la zona redondeada a unos 11 km, una vez al día.
 */

const NO_PREGUNTAR_MS = 90 * 24 * 60 * 60 * 1000;
const ESPERA_MS = 8000;
const MOTIVOS: Motivo[] = ['negada', 'bloqueada', 'sin-soporte'];

type Estado =
  | { tipo: 'pregunta' }
  | { tipo: 'sin-zona'; motivo: Motivo; volver: string | null }
  | null;

const TEXTO_SIN_ZONA: Record<Motivo, string> = {
  negada:
    'Para abrir cualquier anuncio necesitamos la zona aproximada desde donde nos visitas (unos 10 km a la redonda). No guardamos tu nombre, tu dirección ni tu ubicación exacta. El resto del portal lo puedes seguir viendo.',
  bloqueada:
    'Tu navegador tiene la ubicación bloqueada para este sitio. Para activarla, toca el candado o el ícono junto a la dirección de la página, entra a los permisos y permite la ubicación. Luego vuelve a intentarlo.',
  'sin-soporte':
    'Este navegador no permite compartir la ubicación. Abre el portal en Chrome, Safari o Firefox para ver los anuncios.',
};

export function AvisoUbicacion() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const principal = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (esNavegadorDeAdministrador()) return;

    let timer: number | undefined;
    let vivo = true;
    const limpiar = () => {
      vivo = false;
      window.clearTimeout(timer);
    };

    // Viene de un anuncio que no se abrió: se le explica de una vez.
    const params = new URLSearchParams(location.search);
    const motivo = params.get('ubicacion') as Motivo | null;
    if (motivo && MOTIVOS.includes(motivo)) {
      const volver = destinoSeguro(params.get('volver'));
      params.delete('ubicacion');
      params.delete('volver');
      const resto = params.toString();
      history.replaceState(
        history.state,
        '',
        `${location.pathname}${resto ? `?${resto}` : ''}${location.hash}`,
      );
      timer = window.setTimeout(() => vivo && setEstado({ tipo: 'sin-zona', motivo, volver }), 150);
      return limpiar;
    }

    if (!puedeUbicar()) return limpiar;

    const mostrarLuego = () => {
      timer = window.setTimeout(() => {
        if (!vivo) return;
        // Si la página ya la está pidiendo, o ya la compartió, no se repite.
        if (document.querySelector('[data-puerta-zona]')) return;
        if (leerDecision()?.r === 'si' && anunciosAbiertos()) return;
        setEstado({ tipo: 'pregunta' });
      }, ESPERA_MS);
    };

    const d = leerDecision();
    void permiso().then((p) => {
      if (!vivo) return;
      if (p === 'denied') {
        cerrarAnuncios();
        if (d?.r !== 'no') guardarDecision({ r: 'no', t: Date.now() });
        return;
      }
      // La pantalla de un anuncio se encarga sola de ubicar o preguntar.
      if (document.querySelector('[data-puerta-zona]')) return;
      if (d?.r === 'si') {
        if (d.e === hoy() && anunciosAbiertos()) return;
        // Ya aceptó: con el permiso vigente se renueva sin preguntar otra vez.
        // Si el navegador lo olvidó, se vuelve a explicar antes de pedirlo.
        if (p === 'granted') void ubicar();
        else if (p === 'prompt') mostrarLuego();
        return;
      }
      if (d?.r === 'no' && Date.now() - d.t < NO_PREGUNTAR_MS) return;
      mostrarLuego();
    });

    return limpiar;
  }, []);

  useEffect(() => {
    if (estado?.tipo === 'sin-zona') principal.current?.focus();
  }, [estado]);

  if (!estado) return null;

  const compartir = async () => {
    setError(null);
    setOcupado(true);
    const r = await ubicar();
    setOcupado(false);
    if (r === 'ok') {
      const volver = estado.tipo === 'sin-zona' ? estado.volver : null;
      setEstado(null);
      if (volver) router.push(volver);
      return;
    }
    if (r === 'negada') {
      const motivo: Motivo = (await permiso()) === 'denied' ? 'bloqueada' : 'negada';
      if (estado.tipo === 'sin-zona') setEstado({ ...estado, motivo });
      else setEstado(null);
      return;
    }
    setError('No pudimos saber tu ubicación. Revisa que la ubicación del teléfono esté encendida e inténtalo de nuevo.');
  };

  if (estado.tipo === 'sin-zona') {
    return (
      <div
        className={`${styles.aviso} ${styles.destacado}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="aviso-zona-titulo"
        aria-describedby="aviso-zona-texto"
      >
        <p id="aviso-zona-titulo" className={styles.titulo}>
          Sin compartir tu ubicación no puedes ver los anuncios
        </p>
        <p id="aviso-zona-texto" className={styles.texto}>
          {TEXTO_SIN_ZONA[estado.motivo]}
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {ocupado && (
          <p className={styles.espera} role="status">
            Buscando tu zona…
          </p>
        )}
        <div className={styles.acciones}>
          {estado.motivo !== 'sin-soporte' && (
            <button
              ref={principal}
              type="button"
              className={styles.si}
              disabled={ocupado}
              onClick={() => void compartir()}
            >
              {estado.motivo === 'bloqueada' ? 'Ya la permití, intentar de nuevo' : 'Compartir mi zona'}
            </button>
          )}
          <button
            ref={estado.motivo === 'sin-soporte' ? principal : undefined}
            type="button"
            className={styles.no}
            onClick={() => setEstado(null)}
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.aviso} role="dialog" aria-modal="false" aria-labelledby="aviso-zona-titulo">
      <p id="aviso-zona-titulo" className={styles.titulo}>
        ¿Desde dónde nos visitas?
      </p>
      <p className={styles.texto}>
        Para ver los anuncios te pedimos la zona aproximada desde donde nos visitas (unos 10 km a la
        redonda). No guardamos tu nombre, tu dirección ni tu ubicación exacta. Si prefieres no
        compartirla, el resto del portal lo puedes seguir viendo.
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.acciones}>
        <button type="button" className={styles.si} disabled={ocupado} onClick={() => void compartir()}>
          Compartir mi zona
        </button>
        <button
          type="button"
          className={styles.no}
          onClick={() => {
            setEstado(null);
            guardarDecision({ r: 'no', t: Date.now() });
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
