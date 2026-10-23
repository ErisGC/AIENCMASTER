/**
 * Rutas del panel que la web puede llamar directo a esta API con un permiso
 * temporal de subida, en vez de pasar por el proxy de Vercel, que rechaza
 * cuerpos de más de 4,5 MB.
 *
 * Solo entran las que reciben archivos. Un permiso queda atado a una de estas
 * rutas exactas (método y dirección); para cualquier otra no sirve.
 */
const ID = "[A-Za-z0-9-]{1,64}";

const RUTAS: ReadonlyArray<readonly [string, RegExp]> = [
  ["POST", /^\/admin\/announcements$/],
  ["POST", /^\/admin\/churches$/],
  ["PATCH", new RegExp(`^/admin/churches/${ID}$`)],
  ["POST", new RegExp(`^/admin/churches/${ID}/announcements$`)],
  ["POST", new RegExp(`^/admin/churches/${ID}/studies$`)],
  ["POST", new RegExp(`^/admin/churches/${ID}/directors$`)],
  ["PATCH", new RegExp(`^/admin/directors/${ID}$`)],
  ["POST", /^\/admin\/site\/backgrounds$/],
  ["POST", /^\/admin\/me\/photo$/],
  ["POST", /^\/admin\/support\/conversations$/],
  ["POST", new RegExp(`^/admin/support/conversations/${ID}/messages$`)],
  ["POST", new RegExp(`^/admin/support/inbox/${ID}/messages$`)],
];

/**
 * Devuelve la ruta normalizada (`MÉTODO /dirección`) si admite subida
 * directa, o `null` si no. Ignora la consulta (`?…`) de la dirección.
 */
export function rutaDeSubidaDirecta(
  method: string | undefined,
  url: string | undefined,
): string | null {
  if (typeof method !== "string" || typeof url !== "string") return null;
  const metodo = method.toUpperCase();
  const path = url.split("?")[0].split("#")[0];
  for (const [permitido, patron] of RUTAS) {
    if (permitido === metodo && patron.test(path)) {
      return `${metodo} ${path}`;
    }
  }
  return null;
}
