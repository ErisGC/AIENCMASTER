import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';

export type GlobalPermission =
  | 'MANAGE_GLOBAL_ANNOUNCEMENTS'
  | 'MANAGE_CHURCHES'
  | 'MANAGE_ADMINS'
  | 'VIEW_ALL_REPORTS';

export type ChurchPermission =
  | 'MANAGE_CHURCH_ANNOUNCEMENTS'
  | 'SUBMIT_REPORTS'
  | 'EDIT_CHURCH_INFO'
  | 'MANAGE_DIRECTORS';

export type AnyPermission = GlobalPermission | ChurchPermission;

export interface PermissionDescriptor {
  key: AnyPermission;
  label: string;
  description: string;
  group: 'global' | 'church';
}

export interface PermissionTemplate {
  key: string;
  name: string;
  description: string;
  globalPermissions: GlobalPermission[];
  churchPermissions: ChurchPermission[];
}

export interface PermissionsCatalogResponse {
  catalog: PermissionDescriptor[];
  templates: PermissionTemplate[];
}

export interface ChurchAssignmentSummary {
  id: string;
  churchId: string;
  churchName: string | null;
  permissions: ChurchPermission[];
}

async function permissionsRequest<T>(
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
    // Sesión caducada a mitad de la navegación: se lleva al acceso en vez de
    // dejar el aviso pegado en pantalla hasta la siguiente navegación.
    if (res.status === 401) manejarSesionExpirada(path);
    const text = await res.text().catch(() => '');
    if (typeof window !== 'undefined') {
      const log = res.status >= 500 ? console.error : console.debug;
      log('[admin-permissions]', init?.method ?? 'GET', path, res.status, text);
    }
    const friendly =
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos para esta acción.'
          : res.status === 404
            ? 'Recurso no encontrado.'
            : res.status === 409
              ? 'Conflicto.'
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

export function adminGetPermissionsCatalog() {
  return permissionsRequest<PermissionsCatalogResponse>(
    '/admin/security/permissions/catalog',
  );
}

export function adminUpdateGlobalPermissions(
  accountId: string,
  permissions: GlobalPermission[],
) {
  return permissionsRequest(`/admin/security/accounts/${accountId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ permissions }),
  });
}

export function adminAssignChurch(
  accountId: string,
  churchId: string,
  permissions: ChurchPermission[],
) {
  return permissionsRequest(`/admin/security/accounts/${accountId}/churches`, {
    method: 'POST',
    body: JSON.stringify({ churchId, permissions }),
  });
}

export function adminUpdateChurchPermissions(
  accountId: string,
  churchId: string,
  permissions: ChurchPermission[],
) {
  return permissionsRequest(
    `/admin/security/accounts/${accountId}/churches/${churchId}/permissions`,
    {
      method: 'PATCH',
      body: JSON.stringify({ permissions }),
    },
  );
}

export function adminRemoveChurchAssignment(
  accountId: string,
  churchId: string,
) {
  return permissionsRequest(
    `/admin/security/accounts/${accountId}/churches/${churchId}/remove`,
    { method: 'POST' },
  );
}

/**
 * Cambia el rol de una cuenta existente. El backend valida que:
 *   - la cuenta target NO sea la propia (no autocambio de rol)
 *   - al degradar un ROOT, queda al menos otro ROOT activo
 * Tras el cambio, el JWT de la cuenta afectada queda invalidado (bump de
 * tokenVersion) — la persona afectada deberá iniciar sesión de nuevo.
 */
export function adminUpdateAccountRole(
  accountId: string,
  role: 'ROOT' | 'ADMIN',
) {
  return permissionsRequest(
    `/admin/security/accounts/${accountId}/role`,
    {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    },
  );
}
