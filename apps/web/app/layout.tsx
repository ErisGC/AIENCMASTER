import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { PublicShell } from './components/PublicShell';
import { THEME_COLOR, THEME_INIT_SCRIPT } from './lib/theme-init';
import './globals.css';

/*
 * Tipografía institucional cinematográfica:
 *   - Fraunces (serif display de alto contraste) para titulares.
 *   - Inter (sans neutro) para cuerpo y UI.
 * Ambas son variables; se exponen como CSS vars y globals.css las consume.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AIENC',
  description:
    'Portal oficial de la Iglesia Asociación de Iglesias Evangélicas del Norte de Colombia: anuncios, iglesias asociadas, eventos e información institucional.',
};

// Color de la barra del navegador en el celular. El script del <head> lo
// cambia al del modo oscuro si esa es la tonalidad guardada.
export const viewport: Viewport = {
  themeColor: THEME_COLOR.light,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${fraunces.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica la tonalidad guardada (claro u oscuro) antes de pintar, para
            que ninguna página parpadee con la otra al cargar. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {/* Marca el documento como "con JS" lo antes posible. Si JS no corre,
            el CSS (html:not(.js)) revela el contenido [data-reveal] de una vez. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <PublicShell>{children}</PublicShell>
      </body>
    </html>
  );
}
