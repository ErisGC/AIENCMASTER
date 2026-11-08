import Link from 'next/link';

import styles from './components/StatusPage.module.css';

export const metadata = {
  title: 'Página no encontrada — AIENC',
};

/**
 * Página 404 en español. Antes se mostraba la de Next.js, en inglés y sin la
 * navegación del sitio.
 */
export default function NotFound() {
  return (
    <main className={styles.wrap}>
      <section className={styles.card}>
        <span className={styles.code}>Error 404</span>
        <h1 className={styles.title}>No encontramos esta página</h1>
        <p className={styles.text}>
          Puede que el enlace esté incompleto o que el contenido ya no esté
          publicado. Desde aquí puedes volver al inicio o ver los anuncios.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primary}>
            Ir al inicio
          </Link>
          <Link href="/announcements" className={styles.secondary}>
            Ver anuncios
          </Link>
        </div>
      </section>
    </main>
  );
}
