import { API_BASE_URL } from './api';

export type SupportMessage = {
  id: string;
  senderKind: 'AUTHOR' | 'ROOT';
  body: string;
  attachments: { url: string; kind: string; name: string; bytes: number }[];
  createdAt: string;
};

export type SupportConversation = {
  id: string;
  subject: string;
  authorKind: 'GUEST' | 'ADMIN';
  authorName: string;
  status: 'OPEN' | 'CLOSED' | 'BLOCKED';
  lastMessageAt: string;
  unread: number;
};

export type SupportThread = {
  conversation: SupportConversation;
  messages: SupportMessage[];
};

/** Identificador del visitante, guardado en su propio navegador. */
const TOKEN_KEY = 'aienc_support_token';

export function guestToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveGuestToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new Error('No se pudo contactar el servidor. Revisa tu conexión.');
  }
  if (!res.ok) {
    let msg = 'No se pudo completar la solicitud.';
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (typeof data.message === 'string') msg = data.message;
      else if (Array.isArray(data.message)) msg = data.message[0];
    } catch {
      /* respuesta sin cuerpo legible */
    }
    throw new Error(msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* ── Visitante del portal ── */

export async function guestStart(form: FormData) {
  const existing = guestToken();
  if (existing) form.append('token', existing);
  const out = await req<{ token: string; conversation: SupportConversation }>(
    '/support/guest/start',
    { method: 'POST', body: form },
  );
  saveGuestToken(out.token);
  return out;
}

/**
 * El identificador del visitante viaja en una cabecera, no en la dirección.
 *
 * Este valor da acceso al historial de conversación de quien escribe. En la
 * dirección quedaba registrado en los accesos del servidor, del proxy y de
 * cualquier intermediario, de modo que quien leyera esos registros podía
 * suplantar a un visitante. En una cabecera no se registra.
 */
function tokenHeader(): Record<string, string> {
  const token = guestToken();
  return token ? { 'X-Aienc-Support-Token': token } : {};
}

export function guestConversations() {
  if (!guestToken()) return Promise.resolve<SupportConversation[]>([]);
  return req<SupportConversation[]>('/support/guest/conversations', {
    headers: tokenHeader(),
  });
}

export function guestThread(id: string) {
  return req<SupportThread>(`/support/guest/conversations/${id}`, {
    headers: tokenHeader(),
  });
}

export function guestReply(id: string, form: FormData) {
  const token = guestToken();
  if (token) form.append('token', token);
  return req<SupportMessage>(`/support/guest/conversations/${id}/messages`, {
    method: 'POST',
    body: form,
  });
}

/* ── Bandeja del administrador principal ── */

export function inbox() {
  return req<SupportConversation[]>('/admin/support/inbox');
}

export function inboxUnread() {
  return req<{ unread: number }>('/admin/support/inbox/unread');
}

export function inboxThread(id: string) {
  return req<SupportThread>(`/admin/support/inbox/${id}`);
}

export function inboxReply(id: string, form: FormData) {
  return req<SupportMessage>(`/admin/support/inbox/${id}/messages`, {
    method: 'POST',
    body: form,
  });
}

export function setConversationStatus(
  id: string,
  status: 'OPEN' | 'CLOSED' | 'BLOCKED',
) {
  return req<SupportConversation>(`/admin/support/inbox/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}
