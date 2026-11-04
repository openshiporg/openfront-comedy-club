import { test } from 'node:test'; import assert from 'node:assert/strict';
import { effectiveScanTime, enqueueScan, drainQueue, MAX_SCAN_AGE_MS, type QueuedScan } from './doorQueue';
const now = new Date('2026-11-05T02:00:00Z'); const s = (code: string): QueuedScan => ({ key: 'k-' + code, code, scannedAt: '2026-11-05T01:30:00Z' });
test('an offline scan keeps its own time', () => assert.equal(effectiveScanTime('2026-11-05T01:30:00Z', now).toISOString(), '2026-11-05T01:30:00.000Z'));
test('future, stale or junk times fall back to now', () => {
  for (const bad of ['2026-11-05T03:00:00Z', new Date(now.getTime() - MAX_SCAN_AGE_MS - 1).toISOString(), 'nope', undefined, 5]) assert.equal(effectiveScanTime(bad, now), now);
});
test('the same code twice on one device is flagged, not queued twice', () => {
  const a = enqueueScan([], s('ABC')); assert.equal(a.duplicate, false);
  const b = enqueueScan(a.queue, s('abc')); assert.equal(b.duplicate, true); assert.equal(b.queue.length, 1);
});
test('drain replays oldest first and removes answered scans, including rejections', async () => {
  const seen: string[] = [];
  const r = await drainQueue([s('A'), s('B'), s('C')], async (x) => { seen.push(x.key); return x.code === 'B' ? { ok: false, error: 'Ticket not found' } : { ok: true, result: 'admitted' }; });
  assert.deepEqual(seen, ['k-A', 'k-B', 'k-C']); assert.deepEqual(r.outcomes.map((o) => o.kind), ['done', 'rejected', 'done']); assert.equal(r.rest.length, 0);
});
test('a network failure stops the drain and keeps the failing scan and everything after it', async () => {
  let n = 0;
  const r = await drainQueue([s('A'), s('B'), s('C')], async () => { if (++n === 2) throw new Error('offline'); return { ok: true, result: 'admitted' }; });
  assert.deepEqual(r.outcomes.map((o) => o.kind), ['done', 'offline']); assert.deepEqual(r.rest.map((x) => x.code), ['B', 'C']);
});
