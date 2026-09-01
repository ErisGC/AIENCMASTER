import { API_BASE_URL } from './api';
import type { Announcement, AnnouncementDetail } from './announcements';

async function adminAnnouncementsReq<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (typeof window !== 'undefined') {
      const log = res.status >= 500 ? console.error : console.debug;
      log('[admin-announcements]', init?.method ?? 'GET', path, res.status, text);
    }
    const friendly =
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos para esta acción.'
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

export type { Announcement, AnnouncementDetail };

export function adminGetAnnouncements() {
  // Ruta canónica del panel. Antes se usaba `/announcements/admin/all`, una
  // duplicada que colgaba del controlador público, devolvía los anuncios sin
  // sus adjuntos y no compartía la cadena de guardas del resto de `/admin`.
  return adminAnnouncementsReq<Announcement[]>('/admin/announcements');
}

export function adminGetAnnouncementById(id: string) {
  return adminAnnouncementsReq<AnnouncementDetail>(`/announcements/${id}`);
}

export function adminCreateAnnouncement(form: FormData) {
  return adminAnnouncementsReq<AnnouncementDetail>('/admin/announcements', {
    method: 'POST',
    body: form,
  });
}

export function adminUpdateAnnouncement(
  id: string,
  dto: Pick<Announcement, 'title' | 'description' | 'author'>,
) {
  return adminAnnouncementsReq<AnnouncementDetail>(`/admin/announcements/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
}

export function adminDeleteAnnouncement(id: string) {
  return adminAnnouncementsReq<{ deleted: boolean; id: string }>(
    `/admin/announcements/${id}`,
    { method: 'DELETE' },
  );
}
