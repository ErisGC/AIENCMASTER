import { requireActiveAdminSession } from '@/app/lib/server-admin-session';
import { DashboardClient } from './DashboardClient';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'AIENC Admin — Métricas',
};

export default async function DashboardPage() {
  // Era la única página del panel sin esta comprobación: quien entrara sin
  // sesión veía el armazón del panel con las métricas en cero y errores de
  // carga, en vez de ir a la pantalla de acceso. Los datos nunca estuvieron
  // expuestos (el servidor los protege igual), pero la puerta quedaba abierta.
  await requireActiveAdminSession();
  return <DashboardClient />;
}
