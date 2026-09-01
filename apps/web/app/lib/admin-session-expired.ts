/**
 * Qué hacer cuando el servidor responde que la sesión ya no vale.
 *
 * Cada archivo de `admin-*.ts` tiene su propia copia del ayudante de peticiones
 * y todas traducían el 401 a "Sesión no válida.", pero ninguna hacía nada más:
 * al caducar la cookie mientras se navegaba, las pantallas se quedaban con ese
 * aviso pegado indefinidamente. Sólo la siguiente navegación completa, con su
 * comprobación en el servidor, llevaba al acceso.
 *
 * Este módulo centraliza la reacción para que las once copias se comporten
 * igual sin tener que unificarlas de golpe.
 */

/** Rutas de autenticación: un 401 aquí es parte del flujo, no una expiración. */
const RUTAS_DE_ACCESO = "/admin/auth/";

/**
 * Páginas donde ya se está resolviendo el acceso. Redirigir desde ellas
 * borraría el mensaje de error que el usuario necesita leer, o daría vueltas.
 */
const PAGINAS_DE_ACCESO = [
  "/admin/login",
  "/admin/bootstrap",
  "/admin/recovery",
  "/admin/pending",
  "/admin/mobile-required",
  "/admin/invite/",
];

let yaRedirigiendo = false;

/**
 * Lleva al acceso cuando la sesión expira a mitad de la navegación.
 *
 * @param ruta Ruta de la API que devolvió 401.
 */
export function manejarSesionExpirada(ruta: string): void {
  if (typeof window === "undefined") return;
  if (ruta.startsWith(RUTAS_DE_ACCESO)) return;

  const actual = window.location.pathname;
  if (PAGINAS_DE_ACCESO.some((p) => actual.startsWith(p))) return;

  // Varias peticiones en vuelo pueden fallar a la vez; basta con una
  // redirección.
  if (yaRedirigiendo) return;
  yaRedirigiendo = true;

  // Navegación completa a propósito: así vuelve a correr la comprobación de
  // sesión del servidor y no queda estado viejo en memoria.
  window.location.assign("/admin/login");
}
