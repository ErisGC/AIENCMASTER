import type { Metadata } from 'next';

import { getPublicChurches, type Church } from '@/app/lib/churches';
import { claveDia, getPublicEvents, type PublicEvent } from '@/app/lib/events';

import { EventsCalendar } from './EventsCalendar';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Cronograma — AIENC',
  description:
    'Cultos, reuniones, asambleas e intensivos programados por las iglesias de la Asociación de Iglesias Evangélicas del Norte de Colombia.',
};

export const dynamic = 'force-dynamic';

/** El sitio público NUNCA debe caerse por una intermitencia de la API. */
async function safeLoadEvents(churchId?: string): Promise<PublicEvent[]> {
  try {
    return await getPublicEvents(churchId ? { churchId } : undefined);
  } catch {
    return [];
  }
}

async function safeLoadChurches(): Promise<Church[]> {
  try {
    return (await getPublicChurches()).filter((c) => c.isActive);
  } catch {
    return [];
  }
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ churchId?: string }>;
}) {
  const { churchId } = await searchParams;
  const iglesiaInicial = churchId && /^[0-9a-f-]{36}$/i.test(churchId) ? churchId : '';

  const [events, churches] = await Promise.all([
    safeLoadEvents(iglesiaInicial || undefined),
    safeLoadChurches(),
  ]);

  // Hoy en Colombia, calculado aquí para que servidor y navegador partan del
  // mismo mes y no haya saltos al hidratar.
  const hoy = claveDia(new Date());

  return (
    <main className={styles.page}>
      <section className={styles.hero} data-reveal>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Cronograma</span>
          <h1 className={styles.title}>Eventos y actividades</h1>
          <p className={styles.subtitle}>
            Los cultos de cada iglesia y las actividades de toda la Asociación,
            en un solo calendario. Toca un día para ver qué hay programado.
          </p>
        </div>
        <div className={styles.heroCard}>
          <span className={styles.heroCardLabel}>Próximos 60 días</span>
          <strong className={styles.heroCardValue}>{events.length}</strong>
          <p className={styles.heroCardText}>
            {events.length === 1 ? 'evento programado' : 'eventos programados'}
          </p>
        </div>
      </section>

      <EventsCalendar
        initialEvents={events}
        churches={churches.map((c) => ({ id: c.id, name: c.name }))}
        initialChurchId={iglesiaInicial}
        today={hoy}
      />
    </main>
  );
}
