import { API_BASE_URL } from './api';

export interface PublicDirector {
  id: string;
  displayName: string;
  role: string;
  photoUrl: string | null;
}

export interface AdminDirector {
  id: string;
  churchId: string;
  displayName: string;
  role: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  linkedAdminAccountId: string | null;
  linkedAdminPhotoUrl: string | null;
  linkedAdminUsername: string | null;
  sortOrder: number;
  createdAt: string;
}

async function directorsRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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
    const text = await res.text().catch(() => '');
    if (typeof window !== 'undefined') {
      const log = res.status >= 500 ? console.error : console.debug;
      log('[directors]', init?.method ?? 'GET', path, res.status, text);
    }
    throw new Error(
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos.'
          : res.status === 404
            ? 'No encontrado.'
            : 'No se pudo completar la solicitud.',
    );
  }

  const txt = await res.text();
  if (!txt) return undefined as T;
  return JSON.parse(txt) as T;
}

export function adminListDirectors(churchId: string) {
  return directorsRequest<AdminDirector[]>(
    `/admin/churches/${churchId}/directors`,
  );
}

export function adminCreateDirector(churchId: string, form: FormData) {
  return directorsRequest<AdminDirector>(
    `/admin/churches/${churchId}/directors`,
    {
      method: 'POST',
      body: form,
    },
  );
}

export function adminUpdateDirector(id: string, form: FormData) {
  return directorsRequest<AdminDirector>(`/admin/directors/${id}`, {
    method: 'PATCH',
    body: form,
  });
}

export function adminDeleteDirector(id: string) {
  return directorsRequest<{ deleted: boolean; id: string }>(
    `/admin/directors/${id}`,
    { method: 'DELETE' },
  );
}
