import Link from 'next/link';
import Image from 'next/image';

import type { Church } from '@/app/lib/churches';

import styles from './ChurchCard.module.css';

export function ChurchCard({ church }: { church: Church }) {
  const inner = (
    <>
      <div className={styles.media}>
        {church.mainImageUrl ? (
          <Image
            src={church.mainImageUrl}
            alt={church.name}
            fill
            className={styles.image}
            sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw"
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}

        <div className={styles.overlay} />

        <div className={styles.mediaTop}>
          <span
            className={`${styles.statusBadge} ${
              church.isActive ? styles.statusActive : styles.statusInactive
            }`}
          >
            {church.isActive ? 'Activa' : 'Inactiva'}
          </span>
          <span className={styles.cityBadge}>{church.city}</span>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.copy}>
          <h3 className={styles.name}>{church.name}</h3>
          <p className={styles.address}>
            {church.address ?? 'Sin direccion publica registrada.'}
          </p>
        </div>

        <div className={styles.footer}>
          <span className={styles.meta}>{church.city}</span>

          {church.isActive ? (
            <span className={styles.cta} aria-hidden="true">
              Ver pagina
            </span>
          ) : (
            <span className={styles.disabledCta} aria-hidden="true">
              Sin detalle publico
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (church.isActive) {
    return (
      <Link
        href={`/churches/${church.id}`}
        className={`${styles.card} ${styles.cardActive}`}
        aria-label={`Ver pagina de ${church.name}`}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={`${styles.card} ${styles.cardInactive}`} aria-label={church.name}>
      {inner}
    </div>
  );
}
