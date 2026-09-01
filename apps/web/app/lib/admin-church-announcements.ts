import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';

export interface ChurchAnnouncementAttachment {
  id: string;
  url: string;
  resourceType: string;
  format: string;
  name: string;
  size: number;
  publicId: string;
}

export interface ChurchAnnouncementSummary {
  id: string;
  churchId: string;
  title: string;
  description: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  createdByAdminAccountId: string;
  lastUpdatedByAdminAccountId: string | null;
  attachments?: ChurchAnnouncementAttachment[];
}

async function caRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (!isFormData && body !== undefined && body !== null) {
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
      log(
        '[admin-church-announcements]',
        init?.method ?? 'GET',
        path,
        res.status,
        text,
      );
    }
    const friendly =
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos sobre esta iglesia.'
          : res.status === 404
            ? 'Anuncio no encontrado.'
            : res.status === 413
              ? 'Archivo demasiado grande.'
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

export function adminListChurchAnnouncements(churchId: string) {
  return caRequest<ChurchAnnouncementSummary[]>(
    `/admin/churches/${churchId}/announcements`,
  );
}

export function adminGetChurchAnnouncement(churchId: string, id: string) {
  return caRequest<ChurchAnnouncementSummary>(
    `/admin/churches/${churchId}/announcements/${id}`,
  );
}

export function adminCreateChurchAnnouncement(
  churchId: string,
  form: FormData,
) {
  return caRequest<ChurchAnnouncementSummary>(
    `/admin/churches/${churchId}/announcements`,
    {
      method: 'POST',
      body: form,
    },
  );
}

export function adminUpdateChurchAnnouncement(
  churchId: string,
  id: string,
  data: Partial<Pick<ChurchAnnouncementSummary, 'title' | 'description' | 'author'>>,
) {
  return caRequest<ChurchAnnouncementSummary>(
    `/admin/churches/${churchId}/announcements/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export function adminDeleteChurchAnnouncement(churchId: string, id: string) {
  return caRequest<{ deleted: boolean; id: string }>(
    `/admin/churches/${churchId}/announcements/${id}`,
    { method: 'DELETE' },
  );
}

/** Pública (sin autenticación, leída por la página de iglesia). */
export function getPublicChurchAnnouncements(churchId: string) {
  return caRequest<ChurchAnnouncementSummary[]>(
    `/churches/${churchId}/announcements`,
  );
}

export function getPublicChurchAnnouncement(churchId: string, id: string) {
  return caRequest<ChurchAnnouncementSummary>(
    `/churches/${churchId}/announcements/${id}`,
  );
}
