import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';

export type Church = {
  id: string;

  name: string;
  city: string;
  address?: string | null;

  mapsLat?: number | null;
  mapsLng?: number | null;
  mapsUrl?: string | null;

  mainImageUrl?: string | null;
  mainImagePublicId?: string | null;

  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;

  avgAttendance?: number | null;

  isActive: boolean;

  createdAt: string;
  updatedAt: string;
};

async function apiReq<T>(path: string, init?: RequestInit): Promise<T> {
  const body = init?.body;

  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;

  const hasBody = body !== undefined && body !== null;

  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  // ✅ Solo setear JSON si hay body y no es FormData
  if (!isFormData && hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    // Sesión caducada a mitad de la navegación: se lleva al acceso en vez de
    // dejar el aviso pegado en pantalla hasta la siguiente navegación.
    if (res.status === 401) manejarSesionExpirada(path);
    const text = await res.text().catch(() => '');
    if (typeof window !== 'undefined') {
      const log = res.status >= 500 ? console.error : console.debug;
      log('[admin-churches]', init?.method ?? 'GET', path, res.status, text);
    }
    const friendly =
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos para esta acción.'
          : res.status === 404
            ? 'Iglesia no encontrada.'
            : res.status === 413
              ? 'Imagen demasiado grande.'
              : res.status === 400
                ? 'Datos inválidos.'
                : res.status >= 500
                  ? 'Error del servidor. Intenta más tarde.'
                  : 'No se pudo completar la solicitud.';
    throw new Error(friendly);
  }

  const txt = await res.text();
  if (!txt) return undefined as T;
  try {
    return JSON.parse(txt) as T;
  } catch {
    throw new Error('Respuesta inválida del servidor.');
  }
}

export function adminUpdateChurchMultipart(id: string, form: FormData) {
  return apiReq<Church>(`/admin/churches/${id}`, {
    method: 'PATCH',
    body: form,
  });
}

export function adminCreateChurchMultipart(form: FormData) {
  return apiReq<Church>('/admin/churches', {
    method: 'POST',
    body: form,
  });
}

export function adminGetChurches() {
  return apiReq<Church[]>('/admin/churches');
}

export function adminGetChurchById(id: string) {
  return apiReq<Church>(`/admin/churches/${id}`);
}

export function adminToggleChurch(id: string) {
  return apiReq<Church>(`/admin/churches/${id}/toggle`, { method: 'PATCH' });
}

export function adminDeleteChurch(id: string) {
  return apiReq<{ deleted: boolean; id: string }>(`/admin/churches/${id}`, {
    method: 'DELETE',
  });
}
