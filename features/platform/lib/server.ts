import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { getAdminMetaAction } from '@/features/dashboard/actions/getAdminMetaAction';
import { canReadList } from '@/features/dashboard/lib/sidebarAccess';

/** Staff reads go through the signed-in session, so list access rules still apply. */
export async function q<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await keystoneClient<T>(query, variables);
  if (!r.success) throw new Error(r.error);
  return r.data as T;
}

/** Whether the signed-in role may read a list, for pages that leave out a section the role cannot see. */
export async function canRead(path: string): Promise<boolean> {
  const meta = await getAdminMetaAction();
  return canReadList(path, meta.success ? meta.data?.lists ?? [] : []);
}

export async function venueTimezone(): Promise<string> {
  try { const d: any = await q(`{ venues(take: 1) { timezone } }`); return d.venues?.[0]?.timezone || 'America/Chicago'; }
  catch { return 'America/Chicago'; }
}
