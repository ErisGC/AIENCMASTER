import Link from 'next/link';
import Image from 'next/image';

import styles from './SiteFooter.module.css';

/**
 * Footer institucional tipo directorio. Sólo presentacional: enlaces internos
 * a rutas que ya existen + datos de contacto en texto (los mismos que muestra
 * /info). No captura datos ni agrega funciones.
 */
export function SiteFooter() {
  // Se calcula, no se escribe: el año fijo dejaba el pie desactualizado.
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <div className={styles.brandRow}>
            <span className={styles.logo}>
              <Image
                src="/Logoaienc.png"
                alt="AIENC"
                width={40}
                height={40}
                style={{ objectFit: 'contain' }}
              />
            </span>
            <span className={styles.brandName}>AIENC</span>
          </div>
          <p className={styles.brandText}>
            Iglesia Asociación de Iglesias Evangélicas del Norte de Colombia.
            Portal institucional con anuncios e información oficial.
          </p>
        </div>

        <nav className={styles.col} aria-label="Páginas">
          <h4 className={styles.colTitle}>Páginas</h4>
          <Link href="/" className={styles.link}>
            Inicio
          </Link>
          <Link href="/announcements" className={styles.link}>
            Anuncios
          </Link>
          <Link href="/churches" className={styles.link}>
            Iglesias
          </Link>
          <Link href="/info" className={styles.link}>
            Información
          </Link>
        </nav>

        <div className={styles.col}>
          <h4 className={styles.colTitle}>Contacto</h4>
          <span className={styles.line}>Valledupar, Cesar — Colombia</span>
          <span className={styles.line}>Calle 6D # 19-60, Los Músicos</span>
          <span className={styles.line}>contacto@aienc.org</span>
        </div>

        <div className={styles.col}>
          <h4 className={styles.colTitle}>Institucional</h4>
          <span className={styles.line}>Nit. 900.418.642-9</span>
          <span className={styles.line}>Personería Jurídica 6252/2010</span>
          <Link href="/admin" className={styles.link}>
            Administración
          </Link>
        </div>
      </div>

      <div className={styles.bottom}>
        <span className={styles.copy}>
          © {year} AIENC. Información oficial y verificada.
        </span>
      </div>
    </footer>
  );
}
