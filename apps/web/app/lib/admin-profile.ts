import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';

export interface AdminProfile {
  id: string;
  username: string;
  displayName: string;
  role: 'ROOT' | 'ADMIN';
  assignedChurchId: string | null;
  assignedChurchName: string | null;
  profilePhotoUrl: string | null;
}

async function profileRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
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
      log('[profile]', init?.method ?? 'GET', path, res.status, text);
    }
    throw new Error(
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 400
          ? 'Imagen no válida.'
          : 'No se pudo completar la solicitud.',
    );
  }

  const txt = await res.text();
  if (!txt) return undefined as T;
  return JSON.parse(txt) as T;
}

export function adminGetMyProfile() {
  return profileRequest<AdminProfile>('/admin/me');
}

export function adminUploadMyPhoto(photoBlob: Blob) {
  const form = new FormData();
  form.append('photo', photoBlob, 'profile.jpg');
  return profileRequest<{ profilePhotoUrl: string }>('/admin/me/photo', {
    method: 'POST',
    body: form,
  });
}

export function adminRemoveMyPhoto() {
  return profileRequest<{ ok: boolean }>('/admin/me/photo', {
    method: 'DELETE',
  });
}
