import { API_BASE_URL } from './api';

export type AdminRole = 'ROOT' | 'ADMIN';
export type AdminDeviceStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
export type AdminDeviceScope = 'ROOT_DEVICE' | 'APPROVED_DEVICE';
export type AdminSessionStatus =
  | 'UNAUTHENTICATED'
  | 'BOOTSTRAP_REQUIRED'
  | 'PENDING'
  | 'REJECTED'
  | 'REVOKED'
  | 'INACTIVE_ACCOUNT'
  | 'ACTIVE';

export type AdminSessionResponse = {
  status: AdminSessionStatus;
  bootstrapAvailable: boolean;
  account?: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
    isActive: boolean;
    /** Permisos globales efectivos. Para ROOT llegan todos. */
    globalPermissions: string[];
    /** Iglesias sobre las que puede operar. Vacío para ROOT: opera en todas. */
    churchAssignments: {
      id: string;
      churchId: string;
      churchName: string | null;
      permissions: string[];
    }[];
    lastLoginAt: string | null;
  };
  device?: {
    id: string;
    deviceId: string;
    deviceName: string;
    roleScope: AdminDeviceScope;
    status: AdminDeviceStatus;
    lastSeenAt: string | null;
  };
  accessRequest?: {
    id: string;
    status: string;
    requestedAt: string;
    resolvedAt: string | null;
  };
};

export type AdminSecuritySummary = {
  adminAccounts: number;
  approvedDevices: number;
  pendingRequests: number;
  recentRevokedDevices: Array<{
    id: string;
    deviceName: string;
    revokedAt: string | null;
  }>;
};

export type SecurityAccessRequest = {
  id: string;
  requestedUsername: string | null;
  deviceId: string;
  deviceName: string;
  platform: string;
  browser: string;
  userAgent: string;
  ip: string | null;
  status: string;
  requestedAt: string;
  resolvedAt: string | null;
  notes: string | null;
  adminAccount: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
  } | null;
};

export type SecurityDevice = {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  browser: string;
  userAgent: string;
  ipLastSeen: string | null;
  roleScope: AdminDeviceScope;
  status: AdminDeviceStatus;
  approvedAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  adminAccount: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
  } | null;
};

import type {
  ChurchPermission,
  GlobalPermission,
} from './admin-permissions';

export type SecurityAccount = {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  /** @deprecated mantenido por compatibilidad UI vieja. Usar churchAssignments. */
  assignedChurchId: string | null;
  /** @deprecated mantenido por compatibilidad UI vieja. */
  assignedChurchName: string | null;
  globalPermissions: GlobalPermission[];
  churchAssignments: Array<{
    id: string;
    churchId: string;
    churchName: string | null;
    permissions: ChurchPermission[];
  }>;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  devices: Array<{
    id: string;
    deviceId: string;
    deviceName: string;
    status: AdminDeviceStatus;
    roleScope: AdminDeviceScope;
    lastSeenAt: string | null;
  }>;
};

export type SecurityAuditLog = {
  id: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  description: string;
  ip: string | null;
  userAgent: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorAdminAccount: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
  } | null;
  actorDevice: {
    id: string;
    deviceName: string;
    deviceId: string;
  } | null;
};

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  const isFormData =
    typeof FormData !== 'undefined' && body instanceof FormData;

  const headers: HeadersInit = {
    ...(init?.headers ?? {}),
  };

  if (body && !isFormData && !('Content-Type' in (headers as Record<string, string>))) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  // Si el servidor no responde (reinicio de despliegue, corte de red), fetch
  // lanza un TypeError con el texto en inglés "Failed to fetch", que llegaba
  // tal cual a la pantalla de acceso. Lo traducimos a algo accionable.
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      'No se pudo contactar el servidor. Revisa tu conexión e inténtalo de nuevo en un momento.',
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Log detallado sólo en consola para debugging.
    // Usamos console.error sólo para 5xx (errores reales de servidor);
    // los 4xx son flujos esperados (credenciales inválidas, sin permisos…)
    // y no deben aparecer en el overlay rojo de Next dev.
    if (typeof window !== 'undefined') {
      const log = res.status >= 500 ? console.error : console.debug;
      log('[admin-api]', init?.method ?? 'GET', path, res.status, text);
    }
    const friendly =
      res.status === 401
        ? 'Sesión no válida.'
        : res.status === 403
          ? 'No tienes permisos para esta acción.'
          : res.status === 404
            ? 'Recurso no encontrado.'
            : res.status === 409
              ? 'Conflicto: el recurso ya existe o fue modificado.'
              : res.status === 429
                ? 'Demasiadas solicitudes. Intenta más tarde.'
                : res.status >= 500
                  ? 'Error del servidor. Intenta más tarde.'
                  : 'No se pudo completar la solicitud.';
    throw new Error(friendly);
  }

  // Algunas respuestas (logout) pueden venir vacías.
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Respuesta inválida del servidor.');
  }
}

export function adminGetSession() {
  return adminRequest<AdminSessionResponse>('/admin/auth/session');
}

export function adminGetBootstrapStatus() {
  return adminRequest<{ available: boolean; enabled: boolean }>('/admin/auth/bootstrap-status');
}

export function adminGetRootRecoveryStatus() {
  return adminRequest<{ available: boolean; enabled: boolean }>(
    '/admin/auth/root-recovery-status',
  );
}

export function adminBootstrap(payload: Record<string, string>) {
  return adminRequest<AdminSessionResponse>('/admin/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function adminRecoverRootDevice(payload: Record<string, string>) {
  return adminRequest<AdminSessionResponse>('/admin/auth/root-recovery', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function adminLogin(payload: Record<string, string>) {
  return adminRequest<AdminSessionResponse>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function adminLogout() {
  return adminRequest<{ success: boolean }>('/admin/auth/logout', {
    method: 'POST',
  });
}

export function adminGetSecuritySummary() {
  return adminRequest<AdminSecuritySummary>('/admin/security/summary');
}

export function adminGetPendingAccessRequests() {
  return adminRequest<SecurityAccessRequest[]>('/admin/security/access-requests');
}

export function adminApproveAccessRequest(id: string, notes?: string) {
  return adminRequest(`/admin/security/access-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export function adminRejectAccessRequest(id: string, notes?: string) {
  return adminRequest(`/admin/security/access-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export function adminGetSecurityDevices() {
  return adminRequest<SecurityDevice[]>('/admin/security/devices');
}

export function adminRevokeDevice(id: string) {
  return adminRequest(`/admin/security/devices/${id}/revoke`, {
    method: 'POST',
  });
}

export function adminGetSecurityAccounts() {
  return adminRequest<SecurityAccount[]>('/admin/security/accounts');
}

export function adminCreateSecurityAccount(payload: {
  username: string;
  password: string;
  displayName: string;
  role: AdminRole;
}) {
  return adminRequest<SecurityAccount>('/admin/security/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function adminUpdateSecurityAccount(
  id: string,
  payload: { displayName?: string; isActive?: boolean },
) {
  return adminRequest<SecurityAccount>(`/admin/security/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function adminResetSecurityPassword(id: string, password: string) {
  return adminRequest<{ success: boolean }>(`/admin/security/accounts/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function adminGetSecurityAuditLogs(params?: {
  actionType?: string;
  actorAdminAccountId?: string;
}) {
  const search = new URLSearchParams();
  if (params?.actionType) search.set('actionType', params.actionType);
  if (params?.actorAdminAccountId) {
    search.set('actorAdminAccountId', params.actorAdminAccountId);
  }

  const query = search.toString();
  return adminRequest<SecurityAuditLog[]>(
    `/admin/security/audit-logs${query ? `?${query}` : ''}`,
  );
}

export interface AccountHistoryResponse {
  account: SecurityAccount;
  actions: Array<{
    id: string;
    actionType: string;
    targetType: string;
    targetId: string | null;
    description: string;
    ip: string | null;
    userAgent: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export function adminGetAccountHistory(id: string) {
  return adminRequest<AccountHistoryResponse>(
    `/admin/security/accounts/${id}/history`,
  );
}
