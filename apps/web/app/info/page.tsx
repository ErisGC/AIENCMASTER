import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Información — AIENC',
  description:
    'Historia, objetivos y credo de la Iglesia Asociación de Iglesias Evangélicas del Norte de Colombia.',
};

export default function InfoPage() {
  return (
    <main className={styles.container}>
      {/* ─── Hero ─── */}
      <header className={styles.header} data-reveal>
        <h1 className={styles.title}>Información institucional</h1>
        <p className={styles.subtitle}>
          Historia, objetivos, credo y datos de contacto de la Iglesia
          Asociación de Iglesias Evangélicas del Norte de Colombia.
        </p>
      </header>

      {/* ─── Historia ─── */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>Nuestra historia</div>
        <h2 className={styles.cardTitle}>
          La historia de la Iglesia AIENC
        </h2>

        <div className={styles.prose}>
          <p>
            En el año 1933 un grupo de cristianos se reunió en New York, Estados
            Unidos, y decidió evangelizar a los pueblos indígenas de América del
            Sur; así fundaron <em>The South American Indian Mission</em> —
            «Misión a los Indígenas de Sur América» —, motivo por el cual un año
            más tarde enviaron varios misioneros al norte de Colombia con el fin
            de evangelizar a las tribus de la Sierra Nevada de Santa Marta, los
            motilones de la serranía del Perijá y los Wayuú de la Guajira.
          </p>

          <p>
            La <strong>South American Mission (SAM)</strong>, o «Misión Sur
            Americana» como es conocida en la actualidad, continuó enviando
            misioneros hasta los años 2010, dejando establecida en la tribu
            Wayuú una asociación denominada <strong>FUNDIEGUA</strong>{' '}
            (Fundación de Iglesias Indígenas en la Guajira). Mientras trabajaban
            con las diferentes tribus del Norte de Colombia, la Palabra también
            germinó en los pueblos civilizados; así comenzaron a fundarse
            iglesias en los departamentos de La Guajira, Cesar y Magdalena.
          </p>

          <p>
            En ese contexto vieron la necesidad de formar los líderes para las
            iglesias fundadas y optaron por hacer los «cursillos», una actividad
            que se realizaba anualmente durante una semana con el propósito de
            entrenar a los líderes nacionales. Un tiempo después establecieron
            institutos dedicados a formar los pastores necesarios para la obra,
            creando un instituto en Fonseca, luego en Riohacha y más tarde en el
            Carmelo, en las estribaciones de la Sierra Nevada de Santa Marta.
          </p>

          <div className={styles.highlight}>
            <span className={styles.highlightYear}>1973</span>
            <p>
              La Gobernación del Departamento de la Guajira otorgó Personería
              Jurídica N.° 124-03-14, del 14 de marzo, con el nombre de{' '}
              <strong>
                Asociación de Iglesias Evangélicas del Norte de Colombia
              </strong>{' '}
              con la sigla <strong>AIENC</strong>, Nit. 892.115.043-8.
            </p>
          </div>

          <div className={styles.highlight}>
            <span className={styles.highlightYear}>2010</span>
            <p>
              El Ministerio del Interior otorgó la Personería Jurídica Especial
              N.° 6252 del 20 de diciembre a la Iglesia Asociación de Iglesias
              Evangélicas del Norte de Colombia AIENC, bajo el Nit.
              900.418.642-9, siendo representante legal el pastor presidente{' '}
              <strong>Obed Ely Gutiérrez Arias</strong>.
            </p>
          </div>

          <p>
            La SAM contribuyó en las gestiones y diligencias encaminadas a
            cumplir con lo instituido por el Estado colombiano, respaldando a las
            congregaciones con misioneros extranjeros, ofrendas para la compra de
            lotes, construcción de templos y colegios, y apoyando a algunos
            obreros nacionales con ofrendas para su sostenimiento. La SAM
            abandonó el país por motivos de la violencia y el peligro para las
            familias extranjeras; sin embargo, luego de formalizarse, la AIENC ha
            continuado con la labor evangelística y educativa para sus miembros en
            Colombia.
          </p>
        </div>
      </section>

      {/* ─── Objetivos ─── */}
      <section className={styles.card}>
        <div className={styles.sectionLabel}>Fundamentos</div>
        <h2 className={styles.cardTitle}>Objetivos de la organización</h2>

        <ol className={styles.numberedList}>
          <li>
            <strong>Predicar el evangelio</strong> en todo el mundo usando todos
            los medios de comunicación posibles para alcanzar las almas perdidas,
            y enseñar que la salvación es exclusivamente por medio de la fe en
            Jesucristo.
            <cite className={styles.verse}>1.ª Tim 4:1-2 · Rom 1:16-17</cite>
          </li>
          <li>
            <strong>Practicar el discipulado</strong> para alcanzar la madurez
            propuesta por el Señor Jesucristo.
            <cite className={styles.verse}>Hech 2:40-47</cite>
          </li>
          <li>
            <strong>Establecer lugares apropiados</strong> para impartir las
            enseñanzas bíblicas.
            <cite className={styles.verse}>Mat 10:11-15 · Hech 16:40</cite>
          </li>
          <li>
            <strong>Alcanzar la madurez espiritual</strong> en la unidad
            fraternal por medio de la ayuda mutua, lo cual es la proposición de
            Dios.
            <cite className={styles.verse}>Ef 4:13-16</cite>
          </li>
          <li>
            <strong>Restaurar a los hermanos</strong> caídos en delitos y
            pecados.
            <cite className={styles.verse}>Gál 6:1</cite>
          </li>
        </ol>
      </section>

      {/* ─── Credo ─── */}
      <section className={styles.credoSection} data-reveal>
        <div className={styles.credoHeader}>
          <div className={styles.sectionLabel}>Doctrina</div>
          <h2 className={styles.credoTitle}>Credo de la Iglesia AIENC</h2>
          <p className={styles.credoSubtitle}>
            Estos son los pilares de fe que fundamentan nuestra identidad como
            cuerpo de creyentes y guían cada acción de la AIENC.
          </p>
        </div>

        <div className={styles.credoGrid}>
          <article className={styles.credoCard}>
            <span className={styles.credoIcon}>&#9775;</span>
            <h3 className={styles.credoCardTitle}>Dios trino</h3>
            <p className={styles.credoText}>
              Creemos en un solo Dios que se manifiesta en tres personas: Dios
              Padre, Dios Hijo y Dios Espíritu Santo.
            </p>
            <cite className={styles.credoVerse}>
              Mat 3:16-17 · Mat 28:19 · 1.ª Jn 5:7
            </cite>
          </article>

          <article className={styles.credoCard}>
            <span className={styles.credoIcon}>&#128214;</span>
            <h3 className={styles.credoCardTitle}>Las Escrituras</h3>
            <p className={styles.credoText}>
              Creemos en la infalibilidad de las Santas Escrituras, las cuales
              fueron inspiradas por Dios.
            </p>
            <cite className={styles.credoVerse}>
              2.ª Tim 3:16-17 · 2.ª Ped 1:21
            </cite>
          </article>

          <article className={styles.credoCard}>
            <span className={styles.credoIcon}>&#10084;</span>
            <h3 className={styles.credoCardTitle}>Salvación por gracia</h3>
            <p className={styles.credoText}>
              Creemos en la necesidad de la salvación del pecador por medio de la
              misericordia de Dios.
            </p>
            <cite className={styles.credoVerse}>
              Jn 3:16 · Hech 4:12 · 1.ª Ped 1:3, 23
            </cite>
          </article>

          <article className={styles.credoCard}>
            <span className={styles.credoIcon}>&#9769;</span>
            <h3 className={styles.credoCardTitle}>La obra de Cristo</h3>
            <p className={styles.credoText}>
              Creemos en la eficacia de la obra de Cristo para la salvación de
              las personas por medio de la fe en Jesucristo.
            </p>
            <cite className={styles.credoVerse}>
              Rom 3:21-26 · 1.ª Ped 2:24
            </cite>
          </article>

          <article className={styles.credoCard}>
            <span className={styles.credoIcon}>&#9734;</span>
            <h3 className={styles.credoCardTitle}>Muerte y resurrección</h3>
            <p className={styles.credoText}>
              Creemos en la muerte y resurrección de Jesucristo, quien se sentó a
              la diestra de Dios el Padre, de donde esperamos su segunda venida.
            </p>
            <cite className={styles.credoVerse}>
              Mat 28:1-10 · 1.ª Cor 15:3-4 · Hech 1:11
            </cite>
          </article>

          <article className={styles.credoCard}>
            <span className={styles.credoIcon}>&#127760;</span>
            <h3 className={styles.credoCardTitle}>La Iglesia universal</h3>
            <p className={styles.credoText}>
              Creemos en la Iglesia universal compuesta por todos los creyentes
              entre el Pentecostés y el rapto de la Iglesia.
            </p>
            <cite className={styles.credoVerse}>1.ª Cor 12:13</cite>
          </article>

          <article className={`${styles.credoCard} ${styles.credoCardWide}`}>
            <span className={styles.credoIcon}>&#9729;</span>
            <h3 className={styles.credoCardTitle}>El rapto de la Iglesia</h3>
            <p className={styles.credoText}>
              Creemos en el rapto de la Iglesia, la esperanza bienaventurada de
              todo creyente en Cristo.
            </p>
            <cite className={styles.credoVerse}>1.ª Tes 4:13</cite>
          </article>
        </div>
      </section>

      {/* ─── Contacto / Datos rápidos ─── */}
      <section className={styles.grid}>
        <div className={styles.smallCard}>
          <h3 className={styles.smallTitle}>Datos legales</h3>
          <ul className={styles.contactList}>
            <li>
              <span className={styles.contactLabel}>Razón social:</span>{' '}
              Iglesia Asociación de Iglesias Evangélicas del Norte de Colombia
              AIENC
            </li>
            <li>
              <span className={styles.contactLabel}>Nit.:</span>{' '}
              900.418.642-9
            </li>
            <li>
              <span className={styles.contactLabel}>Personería Jurídica:</span>{' '}
              Especial N.° 6252 del 20/12/2010 — Ministerio del Interior
            </li>
          </ul>
        </div>

        <div className={styles.smallCard}>
          <h3 className={styles.smallTitle}>Contacto</h3>
          <ul className={styles.contactList}>
            <li>
              <span className={styles.contactLabel}>Correo:</span>{' '}
              contacto@aienc.org
            </li>
            <li>
              <span className={styles.contactLabel}>Teléfono:</span>{' '}
              +57 (---) ---
            </li>
          </ul>
        </div>

        <div className={styles.smallCard}>
          <h3 className={styles.smallTitle}>Ubicación</h3>
          <p className={styles.text}>
            Calle 6D # 19-60, barrio Los Músicos
            <br />
            Valledupar, Cesar — Colombia
          </p>
        </div>

        <div className={styles.smallCard}>
          <h3 className={styles.smallTitle}>Redes sociales</h3>
          <ul className={styles.contactList}>
            <li>Facebook: AIENC</li>
            <li>Instagram: @aienc</li>
            <li>YouTube: AIENC</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
