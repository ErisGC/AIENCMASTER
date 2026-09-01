import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';

export interface PublicBackground {
  id: string;
  imageUrl: string;
  mobileImageUrl: string | null;
}

export interface PublicBackgroundsResponse {
  images: PublicBackground[];
  intervalSeconds: number;
  fadeSeconds: number;
  enabled: boolean;
}

export interface AdminBackground {
  id: string;
  imageUrl: string;
  imagePublicId: string;
  mobileImageUrl: string | null;
  mobileImagePublicId: string | null;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSettings {
  id: string;
  backgroundIntervalSeconds: number;
  backgroundFadeSeconds: number;
  backgroundEnabled: boolean;
}

async function siteRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
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
      log('[site]', init?.method ?? 'GET', path, res.status, text);
    }
    throw new Error(
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos.'
          : res.status === 404
            ? 'No encontrado.'
            : res.status >= 500
              ? 'Error del servidor.'
              : 'No se pudo completar la solicitud.',
    );
  }

  const txt = await res.text();
  if (!txt) return undefined as T;
  return JSON.parse(txt) as T;
}

/* ── Público ── */

export function getPublicBackgrounds() {
  return siteRequest<PublicBackgroundsResponse>('/site/background');
}

/* ── Admin ── */

export function adminGetSiteSettings() {
  return siteRequest<SiteSettings>('/admin/site/settings');
}

export function adminUpdateSiteSettings(payload: Partial<SiteSettings>) {
  return siteRequest<SiteSettings>('/admin/site/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function adminListBackgrounds() {
  return siteRequest<AdminBackground[]>('/admin/site/backgrounds');
}

export function adminCreateBackground(form: FormData) {
  return siteRequest<AdminBackground>('/admin/site/backgrounds', {
    method: 'POST',
    body: form,
  });
}

export function adminUpdateBackground(
  id: string,
  payload: Partial<Pick<AdminBackground, 'label' | 'sortOrder' | 'isActive'>>,
) {
  return siteRequest<AdminBackground>(`/admin/site/backgrounds/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function adminReorderBackgrounds(ids: string[]) {
  return siteRequest<{ ok: boolean }>('/admin/site/backgrounds/order', {
    method: 'PUT',
    body: JSON.stringify({ ids }),
  });
}

export function adminDeleteBackground(id: string) {
  return siteRequest<{ deleted: boolean; id: string }>(
    `/admin/site/backgrounds/${id}`,
    { method: 'DELETE' },
  );
}
