'use client';

import { useEffect, useState } from 'react';

import { contarZona, esNavegadorDeAdministrador } from './Medidor';
import styles from './AvisoUbicacion.module.css';

/**
 * Pide permiso para saber desde qué zona se visita el portal (para el mapa
 * de las estadísticas). Primero se explica qué se guarda y solo si la persona
 * acepta se le pide la ubicación al navegador. Lo que sale del equipo es la
 * zona redondeada a unos 11 km, una vez al día; nunca la ubicación exacta.
 *
 * Si dice que no, no se vuelve a preguntar en 90 días.
 */

const CLAVE = 'aienc-zona';
const NO_PREGUNTAR_MS = 90 * 24 * 60 * 60 * 1000;
const ESPERA_MS = 8000;

interface Decision {
  r: 'si' | 'no';
  t: number;
  /** Último día (AAAA-MM-DD) en que se envió la zona. */
  e?: string;
}

const hoy = () => new Date().toLocaleDateString('en-CA');

function leer(): Decision | null {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Decision | null;
    return d && (d.r === 'si' || d.r === 'no') ? d : null;
  } catch {
    return null;
  }
}

function guardar(d: Decision) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(d));
  } catch {
    // Sin almacenamiento se vuelve a preguntar la próxima vez; nada más.
  }
}

async function permiso(): Promise<PermissionState | null> {
  try {
    const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return p?.state ?? null;
  } catch {
    return null;
  }
}

function ubicar() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      contarZona(pos.coords.latitude, pos.coords.longitude);
      guardar({ r: 'si', t: Date.now(), e: hoy() });
    },
    (err) => {
      // Si la niega en el navegador, se respeta igual que el "Ahora no".
      if (err.code === err.PERMISSION_DENIED) guardar({ r: 'no', t: Date.now() });
    },
    { enableHighAccuracy: false, maximumAge: 6 * 60 * 60 * 1000, timeout: 20000 },
  );
}

export function AvisoUbicacion() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (esNavegadorDeAdministrador()) return;
    if (!window.isSecureContext || !('geolocation' in navigator)) return;

    let timer: number | undefined;
    let vivo = true;
    const mostrarLuego = () => {
      timer = window.setTimeout(() => vivo && setVisible(true), ESPERA_MS);
    };

    const d = leer();
    void permiso().then((estado) => {
      if (!vivo) return;
      if (estado === 'denied') {
        if (d?.r !== 'no') guardar({ r: 'no', t: Date.now() });
        return;
      }
      if (d?.r === 'si') {
        if (d.e === hoy()) return;
        // Ya aceptó: con el permiso vigente se envía sin preguntar otra vez.
        // Si el navegador lo olvidó, se vuelve a explicar antes de pedirlo.
        if (estado === 'granted') ubicar();
        else if (estado === 'prompt') mostrarLuego();
        return;
      }
      if (d?.r === 'no' && Date.now() - d.t < NO_PREGUNTAR_MS) return;
      mostrarLuego();
    });

    return () => {
      vivo = false;
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={styles.aviso} role="dialog" aria-modal="false" aria-labelledby="aviso-zona-titulo">
      <p id="aviso-zona-titulo" className={styles.titulo}>
        ¿Desde dónde nos visitas?
      </p>
      <p className={styles.texto}>
        Si nos dejas, guardamos solo la zona aproximada (unos 10 km a la redonda) para saber en qué
        ciudades se sigue el portal. No guardamos tu nombre, tu dirección ni tu ubicación exacta, y
        puedes decir que no sin ningún problema.
      </p>
      <div className={styles.acciones}>
        <button
          type="button"
          className={styles.si}
          onClick={() => {
            setVisible(false);
            guardar({ r: 'si', t: Date.now() });
            ubicar();
          }}
        >
          Compartir mi zona
        </button>
        <button
          type="button"
          className={styles.no}
          onClick={() => {
            setVisible(false);
            guardar({ r: 'no', t: Date.now() });
          }}
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
