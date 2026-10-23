/**
 * Base URL para llamadas a la API.
 *
 * En SSR (Server Components / Route Handlers) usamos siempre la URL real
 * del backend (Railway / localhost). Es más rápido y no necesita proxy.
 *
 * En el navegador, si la variable `NEXT_PUBLIC_USE_PROXY` vale "true",
 * usamos `/api-proxy` que es un Route Handler interno de Next.js que
 * reenvía la petición al backend. Esto hace que las cookies sean
 * first-party (mismo dominio que el frontend), evitando el bloqueo de
 * navegadores estrictos sobre cookies third-party.
 */
function resolveApiBase(): string {
  if (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_USE_PROXY === "true"
  ) {
    return "/api-proxy";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

export const API_BASE_URL = resolveApiBase();

/**
 * URL real del backend, sin el proxy. Solo para subidas de archivos grandes:
 * el proxy corre en Vercel, que rechaza cuerpos de más de 4,5 MB. Esas
 * subidas no usan cookies sino un permiso temporal (ver admin-reports.ts).
 */
export const API_DIRECT_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * fetch para el panel administrativo.
 *
 * Igual a llamar al proxy con la sesión, salvo cuando el cuerpo lleva
 * archivos: ahí pide con la sesión un permiso de un solo uso para esa ruta y
 * envía los archivos directo a la API, para no chocar con el límite de 4,5 MB
 * del proxy. Si el permiso no se concede, devuelve esa respuesta tal cual
 * para que cada módulo muestre su mensaje (sesión vencida, sin permiso...).
 */
export async function adminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const conArchivos =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!conArchivos || API_BASE_URL !== "/api-proxy") {
    return fetch(`${API_BASE_URL}${path}`, init);
  }

  const method = (init.method ?? "POST").toUpperCase();
  const permiso = await fetch(`${API_BASE_URL}/admin/upload-tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, path }),
    credentials: "include",
    cache: "no-store",
  });
  if (!permiso.ok) return permiso;
  const { ticket } = (await permiso.json()) as { ticket: string };

  const headers = new Headers(init.headers);
  headers.set("X-Aienc-Upload-Ticket", ticket);
  return fetch(`${API_DIRECT_URL}${path}`, {
    ...init,
    method,
    headers,
    credentials: "omit",
    cache: "no-store",
  });
}

/**
 * fetch para los envíos con archivos del visitante del portal (soporte).
 * No usan cookies, así que van directo a la API y no pasan por el límite de
 * tamaño del proxy.
 */
export function publicUploadFetch(path: string, init: RequestInit) {
  return fetch(`${API_DIRECT_URL}${path}`, {
    ...init,
    credentials: "omit",
    cache: "no-store",
  });
}

/**
 * GET genérico para la API
 */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status} on ${path}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Motivo en español que manda el servidor cuando rechaza un archivo (por
 * ejemplo, cuál excede el tamaño máximo). Devuelve null si no hay uno útil.
 */
export function motivoDelServidor(texto: string): string | null {
  try {
    const cuerpo = JSON.parse(texto) as { message?: unknown };
    const m = Array.isArray(cuerpo.message) ? cuerpo.message[0] : cuerpo.message;
    if (typeof m === "string" && /[áéíóúñ]|excede|supera|archivo/i.test(m)) {
      return m;
    }
  } catch {
    /* sin cuerpo legible */
  }
  return null;
}
