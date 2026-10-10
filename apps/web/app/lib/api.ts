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
