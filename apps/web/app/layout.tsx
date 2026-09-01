import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { PublicShell } from './components/PublicShell';
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
  description: 'Plataforma de anuncios AIENC',
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
