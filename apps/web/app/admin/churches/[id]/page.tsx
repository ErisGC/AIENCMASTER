import styles from './page.module.css';
import { requireActiveAdminSession, serverAdminFetch } from '@/app/lib/server-admin-session';
import type { Church } from '@/app/lib/admin-churches';
import { EditChurchClient } from './EditChurchClient';

export default async function AdminChurchEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireActiveAdminSession();
  const { id } = await params;
  const church = await serverAdminFetch<Church>(`/admin/churches/${id}`);

  // Activar o desactivar una iglesia exige el permiso global de iglesias
  // (igual que en la API); eliminarla, como crearla, queda para la cuenta
  // principal. A quien no puede, no se le ofrecen esos botones.
  const isRoot = session.account?.role === 'ROOT';
  const canToggle =
    isRoot ||
    (session.account?.globalPermissions ?? []).includes('MANAGE_CHURCHES');

  return (
    <main className={styles.page}>
      <EditChurchClient
        initialChurch={church}
        canToggle={canToggle}
        canDelete={isRoot}
      />
    </main>
  );
}
