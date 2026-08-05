import type { Metadata } from 'next';
import { Announcement, getAnnouncementsPage } from '@/app/lib/announcements';

import { AnnouncementsList } from './AnnouncementsList';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Anuncios — AIENC',
  description: 'Comunicados y publicaciones oficiales de la Iglesia Asociación de Iglesias Evangélicas del Norte de Colombia.',
};

const PAGE_SIZE = 9;

async function getInitialAnnouncements(): Promise<Announcement[]> {
  try {
    return await getAnnouncementsPage(PAGE_SIZE, 0);
  } catch {
    return [];
  }
}

export default async function AnnouncementsPage() {
  const initialAnnouncements = await getInitialAnnouncements();

  return (
    <main className={styles.page}>
      <section className={styles.hero} data-reveal>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Actualidad institucional</span>
          <h1 className={styles.title}>Anuncios y publicaciones</h1>
          <p className={styles.subtitle}>
            Consulta comunicados recientes, filtra por titulo o fecha y navega el
            contenido publico sin perder claridad visual.
          </p>
        </div>

        <div className={styles.heroCard}>
          <span className={styles.heroCardLabel}>Resultados iniciales</span>
          <strong className={styles.heroCardValue}>{initialAnnouncements.length}</strong>
          <p className={styles.heroCardText}>
            El listado conserva su comportamiento actual con una presentacion mas
            limpia y mejor jerarquia.
          </p>
        </div>
      </section>

      <AnnouncementsList
        initialItems={initialAnnouncements}
        pageSize={PAGE_SIZE}
      />
    </main>
  );
}
