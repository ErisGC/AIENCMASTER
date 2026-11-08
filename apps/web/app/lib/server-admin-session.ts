import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { API_BASE_URL } from './api';
import type { AdminSessionResponse } from './admin-auth';

export async function getServerAdminSession(): Promise<AdminSessionResponse> {
  const cookieHeader = (await cookies()).toString();

  const res = await fetch(`${API_BASE_URL}/admin/auth/session`, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    return {
      status: 'UNAUTHENTICATED',
      bootstrapAvailable: false,
    };
  }

  return res.json() as Promise<AdminSessionResponse>;
}

export async function requireActiveAdminSession() {
  const session = await getServerAdminSession();

  if (session.status === 'ACTIVE') {
    return session;
  }

  if (session.status === 'BOOTSTRAP_REQUIRED' || session.bootstrapAvailable) {
    redirect('/admin/bootstrap');
  }

  if (session.status === 'UNAUTHENTICATED') {
    redirect('/admin/login');
  }

  redirect('/admin/pending');
}

export async function requireRootSecuritySession() {
  const session = await requireActiveAdminSession();

  // Poderes de principal: el dispositivo principal clásico o, desde ahora,
  // la app de la cuenta principal y los navegadores aprobados con ella.
  const principal =
    session.device?.principal ?? session.device?.roleScope === 'ROOT_DEVICE';
  if (session.account?.role !== 'ROOT' || !principal) {
    redirect('/admin/dashboard');
  }

  return session;
}

export async function serverAdminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const headers: HeadersInit = {
    ...(init?.headers ?? {}),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (res.status === 401) {
    redirect('/admin/login');
  }

  if (res.status === 403) {
    redirect('/admin/pending');
  }

  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}
