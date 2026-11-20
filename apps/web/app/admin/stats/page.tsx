import { requireRootSecuritySession } from '@/app/lib/server-admin-session';

import { StatsClient } from './StatsClient';

export const metadata = { title: 'Estadísticas · Panel AIENC' };

/** Solo la cuenta principal, desde un dispositivo principal. */
export default async function AdminStatsPage() {
  await requireRootSecuritySession();
  return <StatsClient />;
}
