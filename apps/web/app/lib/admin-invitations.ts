import { API_BASE_URL } from './api';
import { manejarSesionExpirada } from './admin-session-expired';
import type {
  ChurchPermission,
  GlobalPermission,
} from './admin-permissions';

export type AdminInvitationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REVOKED'
  | 'EXPIRED';

export type AdminTargetRole = 'ROOT' | 'ADMIN';

export interface AdminInvitationSummary {
  id: string;
  username: string;
  displayName: string;
  targetRole: AdminTargetRole;
  assignedChurchId: string | null;
  assignedChurchName: string | null;
  status: AdminInvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface AdminInvitationCreated {
  id: string;
  token: string;
  username: string;
  displayName: string;
  targetRole: AdminTargetRole;
  assignedChurchId: string | null;
  expiresAt: string;
}

export interface InvitationPreview {
  valid: boolean;
  status: AdminInvitationStatus;
  username?: string;
  displayName?: string;
  targetRole?: AdminTargetRole;
  churchName?: string | null;
  expiresAt?: string;
}

async function invitationsRequest<T>(
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
      log(
        '[admin-invitations]',
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
          ? 'No tienes permisos.'
          : res.status === 404
            ? 'Invitación no encontrada.'
            : res.status === 409
              ? 'El nombre de usuario ya está en uso.'
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

/* ── ROOT-only ── */

export function adminListInvitations() {
  return invitationsRequest<AdminInvitationSummary[]>(
    '/admin/security/invitations',
  );
}

export function adminCreateInvitation(payload: {
  username: string;
  displayName: string;
  /** Omitir para invitar a un ROOT (no se asigna a una iglesia). */
  assignedChurchId?: string;
  /** Default 'ADMIN'. Sólo otra cuenta ROOT puede pedir 'ROOT'. */
  targetRole?: AdminTargetRole;
  churchPermissions?: ChurchPermission[];
  globalPermissions?: GlobalPermission[];
}) {
  return invitationsRequest<AdminInvitationCreated>(
    '/admin/security/invitations',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function adminRevokeInvitation(id: string) {
  return invitationsRequest<{ id: string; status: AdminInvitationStatus }>(
    `/admin/security/invitations/${id}`,
    { method: 'DELETE' },
  );
}

/* ── Public (token-based) ── */

export function previewInvitation(token: string) {
  return invitationsRequest<InvitationPreview>(
    `/admin/auth/invitations/preview?token=${encodeURIComponent(token)}`,
  );
}

export function acceptInvitation(token: string, password: string) {
  return invitationsRequest<{
    id: string;
    username: string;
    displayName: string;
    role: AdminTargetRole;
  }>('/admin/auth/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}
