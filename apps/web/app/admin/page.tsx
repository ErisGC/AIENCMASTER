import { redirect } from 'next/navigation';

import { getServerAdminSession } from '@/app/lib/server-admin-session';

export default async function AdminEntryPage() {
  const session = await getServerAdminSession();

  if (session.status === 'ACTIVE') {
    // Métricas es lo primero del menú y le sirve a cualquier administrador;
    // Anuncios (institucionales) solo lo maneja quien tiene ese permiso.
    redirect('/admin/dashboard');
  }

  if (session.status === 'BOOTSTRAP_REQUIRED' || session.bootstrapAvailable) {
    redirect('/admin/bootstrap');
  }

  if (session.status === 'UNAUTHENTICATED') {
    redirect('/admin/login');
  }

  redirect('/admin/pending');
}
