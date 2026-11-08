import Link from 'next/link';
import styles from './page.module.css';
import { requireActiveAdminSession, serverAdminFetch } from '@/app/lib/server-admin-session';
import type { Church } from '@/app/lib/admin-churches';

export default async function AdminChurchesPage() {
  const session = await requireActiveAdminSession();
  const todas = await serverAdminFetch<Church[]>('/admin/churches');

  const account = session.account;
  const isRoot = account?.role === 'ROOT';
  // Crear iglesias es solo de la cuenta principal desde el dispositivo
  // principal (la API lo exige igual); al resto no se le ofrece el botón.
  const canCreate =
    isRoot &&
    (session.device?.principal ?? session.device?.roleScope === 'ROOT_DEVICE');
  // Quien no administra todas las iglesias ve solo las suyas: las demás
  // le responderían "sin permiso" al intentar cualquier cambio.
  const seesAll =
    isRoot || (account?.globalPermissions ?? []).includes('MANAGE_CHURCHES');
  const propias = new Set(
    (account?.churchAssignments ?? []).map((a) => a.churchId),
  );
  const churches = seesAll ? todas : todas.filter((c) => propias.has(c.id));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Iglesias</h1>
          <p className={styles.subtitle}>
            {seesAll
              ? 'Datos, ubicación, encargados y contenido de cada iglesia.'
              : 'Las iglesias que tienes a cargo: datos, encargados y contenido.'}
          </p>
        </div>

        {canCreate && (
          <Link className={styles.primaryBtn} href="/admin/churches/new">
            + Nueva iglesia
          </Link>
        )}
      </header>

      <section className={styles.list}>
        {churches.map((c) => (
          <div key={c.id} className={styles.row}>
            <div className={styles.left}>
              <div className={styles.nameLine}>
                <span className={styles.name}>{c.name}</span>
                <span className={`${styles.badge} ${c.isActive ? styles.badgeOn : styles.badgeOff}`}>
                  {c.isActive ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <div className={styles.meta}>
                <span>{c.city}</span>
                {c.avgAttendance != null && <span>• Prom: {c.avgAttendance}</span>}
              </div>
            </div>

            <div className={styles.actions}>
              <Link className={styles.btn} href={`/admin/churches/${c.id}`}>
                Gestionar
              </Link>
            </div>
          </div>
        ))}

        {churches.length === 0 && (
          <div className={styles.empty}>
            {canCreate
              ? 'Aún no hay iglesias. Crea la primera con “Nueva iglesia”.'
              : seesAll
                ? 'Aún no hay iglesias registradas.'
                : 'Todavía no tienes una iglesia asignada. Pídele a la administración general que te asigne la tuya.'}
          </div>
        )}
      </section>
    </main>
  );
}
