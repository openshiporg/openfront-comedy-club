'use server';

import { randomUUID } from 'node:crypto';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export async function exportShowReport(from: string, to: string) {
  const res = await keystoneClient(`mutation($from: String!, $to: String!, $k: String!) { exportShowReport(from: $from, to: $to, idempotencyKey: $k) }`, { from, to, k: randomUUID() });
  if (!res.success) return { ok: false as const, error: res.error || 'Export failed' };
  return { ok: true as const, data: (res.data as any).exportShowReport as { fileName: string; rows: number; netCents: number; csv: string } };
}
