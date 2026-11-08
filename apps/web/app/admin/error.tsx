'use client';

import Link from 'next/link';

import styles from '@/app/components/StatusPage.module.css';

/**
 * Si una página del panel falla al cargar (una iglesia que ya no existe, la
 * API que no responde...), se queda el menú lateral y se ofrece reintentar o
 * volver, en vez de la pantalla de error en blanco de Next.js.
 */
export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.wrap}>
      <section className={styles.card} role="alert">
        <span className={styles.code}>Algo falló</span>
        <h1 className={styles.title}>No se pudo cargar esta página</h1>
        <p className={styles.text}>
          Puede que el elemento ya no exista o que el servidor no haya
          respondido a tiempo. Intenta de nuevo; si sigue igual, vuelve a
          Métricas y entra otra vez desde el menú.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={reset}>
            Intentar de nuevo
          </button>
          <Link href="/admin/dashboard" className={styles.secondary}>
            Ir a Métricas
          </Link>
        </div>
      </section>
    </div>
  );
}
