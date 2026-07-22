import { API_BASE_URL } from './api';

export interface AdminChurchStudy {
  id: string;
  churchId: string;
  teacherName: string;
  topic: string;
  outline: string | null;
  audioUrl: string;
  audioFormat: string | null;
  audioBytes: number | null;
  createdAt: string;
}

async function studiesRequest<T>(
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
      log('[studies]', init?.method ?? 'GET', path, res.status, text);
    }
    throw new Error(
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos.'
          : res.status === 404
            ? 'No encontrado.'
            : res.status === 413
              ? 'El audio es demasiado grande (máximo 25 MB).'
              : 'No se pudo completar la solicitud.',
    );
  }

  const txt = await res.text();
  if (!txt) return undefined as T;
  return JSON.parse(txt) as T;
}

export function adminListStudies(churchId: string) {
  return studiesRequest<AdminChurchStudy[]>(
    `/admin/churches/${churchId}/studies`,
  );
}

export function adminCreateStudy(churchId: string, form: FormData) {
  return studiesRequest<AdminChurchStudy>(
    `/admin/churches/${churchId}/studies`,
    { method: 'POST', body: form },
  );
}

export function adminDeleteStudy(churchId: string, id: string) {
  return studiesRequest<{ deleted: boolean; id: string }>(
    `/admin/churches/${churchId}/studies/${id}`,
    { method: 'DELETE' },
  );
}
