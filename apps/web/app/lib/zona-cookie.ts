/**
 * Cookie que abre los anuncios: la deja el navegador cuando la persona
 * comparte su zona. El servidor la lee para decidir si muestra el anuncio o
 * la pantalla que pide la ubicación. Lleva solo la hora en que se compartió.
 *
 * Dura dos días y se renueva cada vez que se vuelve a ubicar (una vez al día
 * con el permiso vigente). Si el navegador bloquea la ubicación, se borra.
 */
export const COOKIE_ZONA = 'aienc_zona';

const DURA_S = 2 * 24 * 60 * 60;

export function abrirAnuncios() {
  const segura = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_ZONA}=${Date.now()}; Max-Age=${DURA_S}; Path=/; SameSite=Lax${segura}`;
}

export function cerrarAnuncios() {
  document.cookie = `${COOKIE_ZONA}=; Max-Age=0; Path=/; SameSite=Lax`;
}

export function anunciosAbiertos(): boolean {
  return document.cookie.split(/;\s*/).some((c) => c.startsWith(`${COOKIE_ZONA}=`) && c.length > COOKIE_ZONA.length + 1);
}
