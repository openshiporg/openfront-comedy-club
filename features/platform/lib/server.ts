import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

/** Staff reads go through the signed-in session, so list access rules still apply. */
export async function q<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await keystoneClient<T>(query, variables);
  if (!r.success) throw new Error(r.error);
  return r.data as T;
}

export async function venueTimezone(): Promise<string> {
  try { const d: any = await q(`{ venues(take: 1) { timezone } }`); return d.venues?.[0]?.timezone || 'America/Chicago'; }
  catch { return 'America/Chicago'; }
}
