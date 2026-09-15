import { requireActiveAdminSession } from '@/app/lib/server-admin-session';

import { EventsAdminClient } from './EventsAdminClient';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'AIENC Admin — Cronograma',
};

export default async function AdminEventsPage() {
  await requireActiveAdminSession();
  return <EventsAdminClient />;
}
