import type { Metadata } from 'next';

import { DownloadClient } from './DownloadClient';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Descargar app AIENC',
  description:
    'Descarga de la aplicación de administración de la AIENC para Android.',
  // A esta página se llega por enlace directo: no se enlaza desde el sitio ni
  // interesa que aparezca en buscadores.
  robots: { index: false, follow: false },
};

export default function DescargarPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Aplicación para administradores</p>
        <h1 className={styles.title}>AIENC Admin</h1>
        <p className={styles.lead}>
          La aplicación para gestionar anuncios, iglesias, informes y estudios
          desde el teléfono. Es para uso de los administradores de la
          Asociación.
        </p>

        <DownloadClient />
      </section>
    </main>
  );
}
