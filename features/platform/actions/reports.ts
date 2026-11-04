'use server';

import { randomUUID } from 'node:crypto';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export async function exportShowReport(from: string, to: string) {
  const res = await keystoneClient(`mutation($from: String!, $to: String!, $k: String!) { exportShowReport(from: $from, to: $to, idempotencyKey: $k) }`, { from, to, k: randomUUID() });
  if (!res.success) return { ok: false as const, error: res.error || 'Export failed' };
  return { ok: true as const, data: (res.data as any).exportShowReport as { fileName: string; rows: number; netCents: number; csv: string } };
}

export async function exportPayStatement(comedianId: string, year: number) {
  const res = await keystoneClient(`mutation($c: ID!, $y: Int!, $k: String!) { exportPayStatement(comedianId: $c, year: $y, idempotencyKey: $k) }`, { c: comedianId, y: year, k: randomUUID() });
  if (!res.success) return { ok: false as const, error: res.error || 'Export failed' };
  return { ok: true as const, data: (res.data as any).exportPayStatement as { fileName: string; rows: number; paidCents: number; csv: string } };
}
