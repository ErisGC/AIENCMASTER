import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getPublicChurchById } from '@/app/lib/churches';
import {
  getPublicChurchAnnouncements,
  type ChurchAnnouncementSummary,
} from '@/app/lib/admin-church-announcements';
import {
  getPublicChurchStudies,
  type ChurchStudy,
} from '@/app/lib/church-studies';
import { ChurchMap } from './ChurchMap';
import { DirectorsSection } from './DirectorsSection';
import styles from './page.module.css';

type ChurchPageProps = {
  params: Promise<{ id: string }>;
};

async function loadChurch(id: string) {
  try {
    return await getPublicChurchById(id);
  } catch (error) {
    if (error instanceof Error && error.message.includes('API error 404')) {
      notFound();
    }

    throw error;
  }
}

async function safeLoadAnnouncements(
  id: string,
): Promise<ChurchAnnouncementSummary[]> {
  try {
    return await getPublicChurchAnnouncements(id);
  } catch {
    return [];
  }
}

async function safeLoadStudies(id: string): Promise<ChurchStudy[]> {
  try {
    return await getPublicChurchStudies(id);
  } catch {
    return [];
  }
}

export default async function ChurchDetailPage({ params }: ChurchPageProps) {
  const { id } = await params;
  const [church, announcements, studies] = await Promise.all([
    loadChurch(id),
    safeLoadAnnouncements(id),
    safeLoadStudies(id),
  ]);

  const mapsHref =
    church.mapsUrl ??
    (church.mapsLat != null && church.mapsLng != null
      ? `https://www.google.com/maps?q=${church.mapsLat},${church.mapsLng}`
      : null);

  const dateFormatter = new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hasDirectors = !!church.directors && church.directors.length > 0;

  // Compatibilidad: las iglesias antiguas sólo tienen el campo de texto
  // `representatives`. Mientras no se carguen representantes como registros
  // (con foto, celular y correo), mostramos esos nombres igualmente como
  // tarjetas para que la ficha exista desde el primer día; al abrirlas indican
  // que aún no hay datos de contacto. En cuanto se crea el registro real,
  // manda el registro y este respaldo desaparece.
  const legacyNames =
    !hasDirectors && church.representatives
      ? church.representatives
          .split(/[,;/]|\sy\s/i)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const directorsToShow = hasDirectors
    ? church.directors!
    : legacyNames.map((name, i) => ({
        id: `legacy-${i}`,
        displayName: name,
        role: '',
        phone: null,
        email: null,
        photoUrl: null,
      }));

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/churches" className={styles.backLink}>
          Volver a iglesias
        </Link>

        <section className={styles.hero}>
          {church.coverImageUrl ? (
            <Image
              src={church.coverImageUrl}
              alt={`Portada de ${church.name}`}
              fill
              className={styles.heroImg}
              sizes="100vw"
              priority
            />
          ) : (
            <div className={styles.heroFallback} aria-hidden="true" />
          )}

          <div className={styles.heroOverlay} />

          <div className={styles.heroInner}>
            <div className={styles.avatar}>
              {church.mainImageUrl ? (
                <Image
                  src={church.mainImageUrl}
                  alt={church.name}
                  fill
                  className={styles.avatarImg}
                  sizes="112px"
                />
              ) : (
                <div className={styles.avatarFallback} aria-hidden="true" />
              )}
            </div>

            <div className={styles.heroText}>
              <p className={styles.eyebrow}>Iglesia asociada</p>
              <h1 className={styles.title}>{church.name}</h1>
              <p className={styles.subtitle}>{church.city}</p>

              <div className={styles.heroMeta}>
                {church.address && <span>{church.address}</span>}
              </div>

              {mapsHref && (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.mapsLink}
                >
                  Ver ubicación en Maps
                </a>
              )}
            </div>
          </div>
        </section>

        <div className={styles.grid}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Información general</h2>

            <dl className={styles.details}>
              <div className={styles.detailRow}>
                <dt>Ciudad</dt>
                <dd>{church.city}</dd>
              </div>

              {church.address && (
                <div className={styles.detailRow}>
                  <dt>Dirección</dt>
                  <dd>{church.address}</dd>
                </div>
              )}

              {/* Los representantes se muestran como tarjetas más abajo; sólo
                  dejamos la fila de texto si no hay ni un nombre que mostrar. */}
              {directorsToShow.length === 0 && church.representatives && (
                <div className={styles.detailRow}>
                  <dt>Representantes</dt>
                  <dd>{church.representatives}</dd>
                </div>
              )}
            </dl>
          </section>

          <ChurchMap
            lat={church.mapsLat ?? null}
            lng={church.mapsLng ?? null}
            mapsHref={mapsHref}
            name={church.name}
          />
        </div>

        <DirectorsSection directors={directorsToShow} />

        {announcements.length > 0 && (
          <section className={styles.announcementsSection}>
            <header className={styles.announcementsHead}>
              <h2 className={styles.cardTitle}>Anuncios de la iglesia</h2>
              <span className={styles.announcementsCount}>
                {announcements.length}{' '}
                {announcements.length === 1 ? 'publicación' : 'publicaciones'}
              </span>
            </header>

            <ul className={styles.announcementsList}>
              {announcements.map((a) => (
                <li
                  key={a.id}
                  id={`anuncio-${a.id}`}
                  className={styles.announcementCard}
                >
                  <div className={styles.announcementMeta}>
                    <span className={styles.announcementAuthor}>
                      {a.author}
                    </span>
                    <span className={styles.announcementDate}>
                      {dateFormatter.format(new Date(a.createdAt))}
                    </span>
                  </div>
                  <h3 className={styles.announcementTitle}>{a.title}</h3>
                  <p className={styles.announcementDesc}>{a.description}</p>
                  {a.attachments && a.attachments.length > 0 && (
                    <div className={styles.announcementAttachments}>
                      {a.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.announcementAttachLink}
                        >
                          {att.name || att.format.toUpperCase()}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {studies.length > 0 && (
          <section className={styles.studiesSection}>
            <header className={styles.studiesHead}>
              <h2 className={styles.cardTitle}>Estudios y mensajes</h2>
              <span className={styles.studiesCount}>
                {studies.length} {studies.length === 1 ? 'audio' : 'audios'}
              </span>
            </header>

            <ul className={styles.studiesList}>
              {studies.map((s) => (
                <li key={s.id} className={styles.studyCard}>
                  <div className={styles.studyMeta}>
                    <span className={styles.studyTeacher}>{s.teacherName}</span>
                    <span className={styles.studyDate}>
                      {dateFormatter.format(new Date(s.createdAt))}
                    </span>
                  </div>
                  <h3 className={styles.studyTopic}>{s.topic}</h3>
                  <audio
                    className={styles.studyAudio}
                    controls
                    preload="none"
                    src={s.audioUrl}
                  >
                    Tu navegador no soporta la reproducción de audio.
                  </audio>
                  {s.outline && (
                    <details className={styles.studyOutline}>
                      <summary>Ver bosquejo</summary>
                      <p>{s.outline}</p>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
