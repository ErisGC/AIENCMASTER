import Link from 'next/link';

import { getLatestAnnouncements } from './lib/announcements';
import { getPublicChurches } from './lib/churches';
import { claveDia, getPublicEvents } from './lib/events';
import { AnnouncementsCarousel } from './components/AnnouncementsCarousel';
import { EventsCarousel } from './components/EventsCarousel';
import { BackgroundRotator } from './components/BackgroundRotator';
import { ChurchCard } from './components/ChurchCard';
import styles from './page.module.css';

export const metadata = {
  title: 'AIENC — Iglesia Asociación de Iglesias Evangélicas del Norte de Colombia',
  description:
    'Anuncios oficiales, iglesias asociadas, cronograma de eventos e información institucional de la AIENC, en Valledupar y el norte de Colombia.',
};

/** Próximos eventos (lo que aún no termina), los más cercanos primero. */
async function cargarProximosEventos() {
  try {
    const ahora = Date.now();
    return (await getPublicEvents())
      .filter((e) => new Date(e.endsAt).getTime() >= ahora)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export default async function HomePage() {
  // El sitio público NUNCA debe caerse por una intermitencia de la API: si
  // una sección no carga, se degrada a vacío en lugar de tumbar la página
  // entera con un 500.
  let announcements: Awaited<ReturnType<typeof getLatestAnnouncements>> = [];
  try {
    announcements = await getLatestAnnouncements();
  } catch {
    announcements = [];
  }

  const upcoming = await cargarProximosEventos();
  const hoy = claveDia(new Date());

  let previewChurches: Awaited<ReturnType<typeof getPublicChurches>> = [];
  try {
    const churches = await getPublicChurches();
    previewChurches = churches.slice(0, 3);
  } catch {
    previewChurches = [];
  }

  return (
    <main className={styles.page}>
      {/* ─────────────────  HERO CINEMATOGRÁFICO  ───────────────── */}
      <section className={styles.hero}>
        <BackgroundRotator variant="hero" />

        <div className={styles.heroInner}>
          <span className={styles.heroEyebrow}>
            Iglesia Asociación de Iglesias Evangélicas del Norte de Colombia
          </span>
          <h1 className={styles.heroTitle}>AIENC</h1>
          <p className={styles.heroLead}>
            El portal oficial de nuestra comunidad de fe. Anuncios, información
            institucional e iglesias asociadas, en un solo lugar.
          </p>

          <div className={styles.heroActions}>
            <Link href="/announcements" className={styles.primaryAction}>
              Ver anuncios
            </Link>
            <Link href="/info" className={styles.secondaryAction}>
              Conócenos
            </Link>
          </div>
        </div>

        <div className={styles.scrollHint} aria-hidden>
          <span className={styles.scrollDot} />
          <span className={styles.scrollText}>Desliza</span>
        </div>
      </section>

      {/* ─────────────────  BANDA: QUÉ ES ESTO  ───────────────── */}
      <section className={styles.band} data-reveal>
        <div className={styles.bandInner}>
          <div className={styles.introGrid}>
            <div>
              <span className={styles.eyebrow}>Portal institucional</span>
              <h2 className={styles.bandTitle}>
                Una sola plataforma para toda la AIENC
              </h2>
            </div>
            <div>
              <p className={styles.bandText}>
                La AIENC reúne a las iglesias evangélicas del norte de Colombia
                bajo una identidad común. Este portal centraliza los comunicados
                oficiales y la información institucional verificada por su
                administración.
              </p>
              <Link href="/info" className={styles.textLink}>
                Conoce nuestra historia →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────  BANDA: PRÓXIMOS EVENTOS  ───────────────── */}
      {upcoming.length > 0 && (
        <section className={styles.band} data-reveal>
          <div className={styles.bandInner}>
            <header className={styles.bandHeader}>
              <div>
                <span className={styles.eyebrow}>Cronograma</span>
                <h2 className={styles.bandTitle}>Próximos eventos</h2>
              </div>
              <Link href="/events" className={styles.textLink}>
                Ver el calendario →
              </Link>
            </header>

            <EventsCarousel events={upcoming} today={hoy} />
          </div>
        </section>
      )}

      {/* ─────────────────  BANDA: ÚLTIMOS ANUNCIOS  ───────────────── */}
      {/* Sin anuncios (o si la API no respondió) la banda no se muestra: antes
          quedaba el título "Últimos anuncios" con el espacio vacío debajo. */}
      {announcements.length > 0 && (
        <section className={`${styles.band} ${styles.bandAlt}`} data-reveal>
          <div className={styles.bandInner}>
            <header className={styles.bandHeader}>
              <div>
                <span className={styles.eyebrow}>Actualidad</span>
                <h2 className={styles.bandTitle}>Últimos anuncios</h2>
              </div>
              <Link href="/announcements" className={styles.textLink}>
                Ver todos →
              </Link>
            </header>

            <AnnouncementsCarousel announcements={announcements} />
          </div>
        </section>
      )}

      {/* ─────────────────  BANDA: IGLESIAS (condicional)  ───────────────── */}
      {previewChurches.length > 0 && (
        <section className={styles.band} data-reveal>
          <div className={styles.bandInner}>
            <header className={styles.bandHeader}>
              <div>
                <span className={styles.eyebrow}>Comunidad</span>
                <h2 className={styles.bandTitle}>Iglesias asociadas</h2>
              </div>
              <Link href="/churches" className={styles.textLink}>
                Ver todas →
              </Link>
            </header>

            <div className={styles.churchGrid}>
              {previewChurches.map((church) => (
                <ChurchCard key={church.id} church={church} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
