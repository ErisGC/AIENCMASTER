'use client';

import { useEffect, useState } from 'react';

import styles from './NuevoBadge.module.css';

const HORA = 60 * 60 * 1000;
const BRILLA_HASTA = 24 * HORA;
const AZUL_HASTA = 48 * HORA;

type Estado = 'brilla' | 'azul' | null;

function estadoDe(fecha: string, ahora: number): { estado: Estado; cambiaEn: number | null } {
  const edad = ahora - new Date(fecha).getTime();
  if (!Number.isFinite(edad) || edad < 0) return { estado: 'brilla', cambiaEn: BRILLA_HASTA };
  if (edad < BRILLA_HASTA) return { estado: 'brilla', cambiaEn: BRILLA_HASTA - edad };
  if (edad < AZUL_HASTA) return { estado: 'azul', cambiaEn: AZUL_HASTA - edad };
  return { estado: null, cambiaEn: null };
}

/**
 * Marca de "Nuevo" en un anuncio: el primer día brilla y cambia de color, el
 * segundo queda azul y desde el tercero ya no aparece. Se calcula en el
 * navegador (la página puede venir guardada de antes) y cambia sola cuando
 * le toca, aunque la página siga abierta.
 */
export function NuevoBadge({ fecha, className }: { fecha: string; className?: string }) {
  const [estado, setEstado] = useState<Estado>(null);

  useEffect(() => {
    let timer: number | undefined;
    const actualizar = () => {
      const { estado: e, cambiaEn } = estadoDe(fecha, Date.now());
      setEstado(e);
      // El máximo de setTimeout es ~24,8 días; aquí nunca pasa de 48 horas.
      if (cambiaEn !== null) timer = window.setTimeout(actualizar, cambiaEn + 1000);
    };
    actualizar();
    return () => window.clearTimeout(timer);
  }, [fecha]);

  if (!estado) return null;
  return (
    <span
      className={`${styles.nuevo} ${estado === 'brilla' ? styles.brilla : styles.azul} ${className ?? ''}`}
    >
      Nuevo
    </span>
  );
}
