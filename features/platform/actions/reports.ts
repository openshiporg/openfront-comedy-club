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

export async function previewSeries(v: { sourceShowId: string; from: string; count: number; everyDays: number; startTime?: string; copyLineup: boolean }) {
  const res = await keystoneClient(`query($s: ID!, $f: String, $c: Int, $e: Int, $t: String, $l: Boolean) { previewShowSeries(sourceShowId: $s, from: $f, count: $c, everyDays: $e, startTime: $t, copyLineup: $l) }`, { s: v.sourceShowId, f: v.from, c: v.count, e: v.everyDays, t: v.startTime || undefined, l: v.copyLineup });
  if (!res.success) return { ok: false as const, error: res.error || 'Preview failed' };
  return { ok: true as const, data: (res.data as any).previewShowSeries as { title: string; timezone: string; rows: { day: string; time: string; problem: string | null }[]; problems: number; tiers: number; lineupSlots: number } };
}

export async function previewLayout(roomId: string, changes: unknown[]) {
  const res = await keystoneClient(`query($r: ID!, $c: JSON!) { previewRoomLayout(roomId: $r, changes: $c) }`, { r: roomId, c: changes });
  if (!res.success) return { ok: false as const, error: res.error || 'Preview failed' };
  return { ok: true as const, data: (res.data as any).previewRoomLayout as { room: string; changes: string[]; tables: number; capacityBefore: number; capacityAfter: number } };
}

export async function seriesProgress(groupId: string) {
  const res = await keystoneClient(`query($g: ID!) { seriesCancelProgress(groupId: $g) }`, { g: groupId });
  if (!res.success) return { ok: false as const, error: res.error || 'Could not read progress' };
  return { ok: true as const, data: (res.data as any).seriesCancelProgress as { requested: boolean; completed: boolean; total: number; done: number; ran: number; refundsWaiting: number; reason: string } };
}
