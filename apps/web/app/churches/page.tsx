import type { Metadata } from 'next';
import { ChurchCard } from '@/app/components/ChurchCard';
import { getPublicChurches } from '@/app/lib/churches';

import styles from './ChurchesPage.module.css';

export const metadata: Metadata = {
  title: 'Iglesias asociadas — AIENC',
  description: 'Directorio de iglesias evangélicas asociadas a la AIENC en el norte de Colombia.',
};

export default async function ChurchesPage() {
  // Si la API está temporalmente inaccesible, mostramos el estado vacío en
  // lugar de tumbar la página con un 500.
  let churches: Awaited<ReturnType<typeof getPublicChurches>> = [];
  try {
    churches = await getPublicChurches();
  } catch {
    churches = [];
  }
  const activeChurches = churches.filter((church) => church.isActive).length;

  return (
    <main className={styles.page}>
      <section className={styles.hero} data-reveal>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Directorio institucional</span>
          <h1 className={styles.title}>Iglesias asociadas</h1>
          <p className={styles.subtitle}>
            Las congregaciones que forman parte de la AIENC. Entra a cada una
            para ver dónde queda, quiénes la dirigen y sus actividades.
          </p>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Iglesias</span>
            <strong className={styles.statValue}>{churches.length}</strong>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Activas</span>
            <strong className={styles.statValue}>{activeChurches}</strong>
          </div>
        </div>
      </section>

      <section className={styles.grid} data-reveal>
        {churches.map((church) => (
          <ChurchCard key={church.id} church={church} />
        ))}
      </section>

      {churches.length === 0 && (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Aún no hay iglesias registradas</h2>
          <p className={styles.emptyText}>
            Cuando la administración registre iglesias, aparecerán aquí.
          </p>
        </div>
      )}
    </main>
  );
}
