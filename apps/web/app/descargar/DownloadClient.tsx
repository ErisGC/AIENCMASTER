'use client';

import { useState } from 'react';

import styles from './page.module.css';

/**
 * URL del APK. Igual que en /admin/mobile-required: si la variable está
 * definida y no vacía manda ella; si no, el último release publicado.
 */
const APK_URL =
  process.env.NEXT_PUBLIC_AIENC_APK_URL?.trim() ||
  'https://github.com/ErisGC/AIENCMASTER/releases/latest/download/aienc-admin.apk';

export function DownloadClient() {
  const [started, setStarted] = useState(false);

  return (
    <>
      <a
        className={styles.button}
        href={APK_URL}
        onClick={() => setStarted(true)}
      >
        Descargar app AIENC
      </a>

      <p className={styles.note}>
        Siempre se descarga la versión más reciente.
      </p>

      {started && (
        <div className={styles.steps} role="status">
          <p className={styles.stepsTitle}>La descarga ya empezó</p>
          <ol className={styles.stepsList}>
            <li>
              Abre el archivo cuando termine de bajar. Suele quedar en la
              carpeta de descargas o en la notificación del navegador.
            </li>
            <li>
              Android te va a pedir permiso para instalar aplicaciones de esta
              procedencia. Acéptalo: aparece porque la app no se distribuye por
              la Play Store.
            </li>
            <li>
              Ábrela e inicia sesión con tu cuenta de administrador. Si es un
              teléfono nuevo, un administrador principal deberá aprobarlo antes
              de que puedas entrar.
            </li>
          </ol>
          <p className={styles.stepsFoot}>
            Si no empezó la descarga,{' '}
            <a className={styles.inlineLink} href={APK_URL}>
              tócalo aquí de nuevo
            </a>
            .
          </p>
        </div>
      )}
    </>
  );
}
