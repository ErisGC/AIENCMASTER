import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import {
  AnnouncementAttachment,
  AnnouncementDetail,
  getAnnouncementById,
} from '@/app/lib/announcements';
import { formatDateTimeWithSeconds } from '@/app/lib/formatDate';

import styles from './page.module.css';

interface Props {
  params: Promise<{ id: string }>;
}

function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * Cloudinary devuelve PDFs con una URL como
 *   https://res.cloudinary.com/<cloud>/image/upload/<...>/<file>.pdf
 * Para mostrar una previsualización (primera página como JPG) usamos
 * la transformación pg_1 + format jpg.
 */
function buildPdfThumbUrl(url: string): string | null {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return null;
  }
  const httpsUrl = url.replace('http://', 'https://');
  const transformed = httpsUrl.replace(
    '/upload/',
    '/upload/pg_1,w_640,q_auto,f_jpg/',
  );
  return transformed.toLowerCase().endsWith('.pdf')
    ? transformed.slice(0, -4) + '.jpg'
    : transformed;
}

function buildDownloadUrl(url: string): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return url;
  }
  return url.replace('/upload/', '/upload/fl_attachment/');
}

/** Una sola consulta por petición, compartida entre los metadatos y la página. */
const cargarAnuncio = cache((id: string) => getAnnouncementById(id));

function resumen(texto: string, max = 155): string {
  const limpio = texto.replace(/[ ]+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const a = await cargarAnuncio(id);
    return {
      title: `${a.title} — Anuncios AIENC`,
      description: resumen(a.description || `Anuncio de la AIENC: ${a.title}`),
    };
  } catch {
    return { title: 'Anuncio — AIENC' };
  }
}

export default async function AnnouncementPage({ params }: Props) {
  const { id } = await params;
  let announcement: AnnouncementDetail;
  try {
    announcement = await cargarAnuncio(id);
  } catch {
    notFound();
  }

  return (
    <main className={styles.container}>
      <Link href="/announcements" className={styles.back}>
        ← Volver a anuncios
      </Link>

      <header className={styles.header}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDot} /> Anuncio oficial
        </span>
        <h1>{announcement.title}</h1>

        <div className={styles.meta}>
          <span className={styles.metaAuthor}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="8" r="3.4" />
              <path d="M5 19a7 7 0 0 1 14 0" />
            </svg>
            {announcement.author}
          </span>
          <span className={styles.metaDivider} aria-hidden />
          <span className={styles.metaDate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
              <path d="M3.5 9.5h17" />
              <path d="M8 3v3" />
              <path d="M16 3v3" />
            </svg>
            {formatDateTimeWithSeconds(announcement.createdAt)}
          </span>
        </div>
      </header>

      <section className={styles.content}>
        <p className={styles.contentText}>{announcement.description}</p>
      </section>

      {announcement.attachments?.length ? (
        <section className={styles.media}>
          <header className={styles.mediaHead}>
            <h2 className={styles.mediaTitle}>Archivos adjuntos</h2>
            <span className={styles.mediaCount}>
              {announcement.attachments.length}{' '}
              {announcement.attachments.length === 1 ? 'archivo' : 'archivos'}
            </span>
          </header>

          <div className={styles.attachments}>
            {announcement.attachments.map((att: AnnouncementAttachment) => {
              const isPdf = att.format?.toLowerCase() === 'pdf';
              const isVideo = att.resourceType === 'video';
              const isImage = att.resourceType === 'image' && !isPdf;
              const downloadUrl = buildDownloadUrl(att.url);

              if (isImage) {
                return (
                  <figure key={att.id} className={styles.imageCard}>
                    <Image
                      src={att.url}
                      alt={att.name}
                      width={1200}
                      height={800}
                      sizes="(max-width: 768px) 100vw, 800px"
                      className={styles.imageEl}
                    />
                    <figcaption className={styles.imageCaption}>
                      <span className={`${styles.badge} ${styles.badgeImage}`}>
                        IMG
                      </span>
                      <span className={styles.captionName}>{att.name}</span>
                      <a
                        href={downloadUrl}
                        className={styles.downloadLink}
                        rel="noopener noreferrer"
                      >
                        Descargar
                      </a>
                    </figcaption>
                  </figure>
                );
              }

              if (isVideo) {
                return (
                  <figure key={att.id} className={styles.videoCard}>
                    <video controls preload="metadata" className={styles.videoEl}>
                      <source src={att.url} />
                    </video>
                    <figcaption className={styles.imageCaption}>
                      <span className={`${styles.badge} ${styles.badgeVideo}`}>
                        VIDEO
                      </span>
                      <span className={styles.captionName}>{att.name}</span>
                      <a
                        href={downloadUrl}
                        className={styles.downloadLink}
                        rel="noopener noreferrer"
                      >
                        Descargar
                      </a>
                    </figcaption>
                  </figure>
                );
              }

              if (isPdf) {
                const thumb = buildPdfThumbUrl(att.url);
                return (
                  <article key={att.id} className={styles.pdfCard}>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.pdfPreview}
                    >
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt={`Vista previa de ${att.name}`}
                          className={styles.pdfThumb}
                          loading="lazy"
                        />
                      ) : (
                        <div className={styles.pdfFallback}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                            <path d="M7 3h7l4 4v14H7Z" />
                            <path d="M14 3v4h4" />
                          </svg>
                        </div>
                      )}
                      <span className={styles.pdfBadgeOverlay}>PDF</span>
                    </a>

                    <div className={styles.pdfBody}>
                      <span className={`${styles.badge} ${styles.badgePdf}`}>
                        PDF
                      </span>
                      <strong className={styles.pdfName}>{att.name}</strong>
                      {att.size ? (
                        <span className={styles.pdfSize}>
                          {formatBytes(att.size)}
                        </span>
                      ) : null}

                      <div className={styles.pdfActions}>
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.pdfOpenBtn}
                        >
                          Abrir
                        </a>
                        <a
                          href={downloadUrl}
                          className={styles.pdfDownloadBtn}
                          rel="noopener noreferrer"
                        >
                          Descargar
                        </a>
                      </div>
                    </div>
                  </article>
                );
              }

              // Otros tipos: link simple
              return (
                <article key={att.id} className={styles.fileCard}>
                  <span className={`${styles.badge} ${styles.badgeFile}`}>
                    {(att.format || 'FILE').toUpperCase()}
                  </span>
                  <span className={styles.captionName}>{att.name}</span>
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.downloadLink}
                  >
                    Abrir
                  </a>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
