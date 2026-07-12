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
            Comunidades visibles dentro del portal publico, con acceso al detalle
            cuando la iglesia se encuentra activa.
          </p>
        </div>

        <div className={styles.heroStats}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total visibles</span>
            <strong className={styles.statValue}>{churches.length}</strong>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Con detalle activo</span>
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
          <h2 className={styles.emptyTitle}>Aun no hay iglesias registradas</h2>
          <p className={styles.emptyText}>
            Cuando el administrador cree iglesias, apareceran aqui
            automaticamente.
          </p>
        </div>
      )}
    </main>
  );
}
