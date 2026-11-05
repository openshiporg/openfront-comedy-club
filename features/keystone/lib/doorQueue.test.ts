import { test } from 'node:test'; import assert from 'node:assert/strict';
import { effectiveScanTime, enqueueScan, drainQueue, MAX_SCAN_AGE_MS, MAX_QUEUE, QUEUE_GRACE_MS, queueExpiry, readStored, describeScan, type QueuedScan } from './doorQueue';
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

test('the queue is capped and says so instead of growing forever', () => {
  let q: QueuedScan[] = [];
  for (let i = 0; i < MAX_QUEUE; i++) q = enqueueScan(q, s('C' + i)).queue;
  const r = enqueueScan(q, s('OVER')); assert.equal(r.full, true); assert.equal(r.queue.length, MAX_QUEUE);
});
test('queue expiry follows the show end plus grace, with a start-based fallback', () => {
  assert.equal(queueExpiry({ startsAt: '2026-11-05T01:00:00Z', endsAt: '2026-11-05T03:00:00Z' }), new Date('2026-11-05T03:00:00Z').getTime() + QUEUE_GRACE_MS);
  assert.equal(queueExpiry({ startsAt: '2026-11-05T01:00:00Z' }), new Date('2026-11-05T01:00:00Z').getTime() + 6 * 3600000 + QUEUE_GRACE_MS);
});
test('stored queues: expired, corrupt and old-format values read as empty', () => {
  const now = Date.now(); const scans = [s('A')];
  assert.equal(readStored(JSON.stringify({ expiresAt: now + 1000, scans }), now).length, 1);
  assert.equal(readStored(JSON.stringify({ expiresAt: now - 1, scans }), now).length, 0);
  assert.equal(readStored(JSON.stringify(scans), now).length, 0); assert.equal(readStored('{bad', now).length, 0); assert.equal(readStored(null, now).length, 0);
});
test('a late duplicate names who admitted first and when; other refusals are explicit', () => {
  const fmt = () => '9:41 PM';
  const d = describeScan('ABC', { result: 'duplicate', admittedAt: '2026-11-05T03:41:00Z', admittedBy: 'Dana Whitfield', admittedMethod: 'scan', holderName: 'Ann' }, fmt);
  assert.equal(d.tone, 'warn'); assert.equal(d.text, 'ABC (Ann): already admitted at 9:41 PM by Dana Whitfield (scan)');
  assert.equal(describeScan('ABC', { result: 'duplicate' }, fmt).text, 'ABC: already admitted');
  assert.equal(describeScan('ABC', { result: 'admitted' }).tone, 'ok');
  assert.match(describeScan('ABC', { result: 'void' }).text, /void/); assert.match(describeScan('ABC', { result: 'wrong_show' }).text, /different show/);
});
test('a scanned QR token is named by the ticket code the server resolved, or cut short before that', async () => {
  const { shortCode, isScanToken } = await import('./doorQueue');
  const tok = 'a'.repeat(64);
  assert.equal(isScanToken(tok), true); assert.equal(isScanToken('T-ABC123'), false); assert.equal(isScanToken('g'.repeat(64)), false);
  assert.equal(shortCode(tok), 'QR aaaaaaaa'); assert.equal(shortCode('T-ABC123'), 'T-ABC123');
  assert.equal(describeScan(tok, { result: 'admitted', ticketCode: 'T-ABC123', holderName: 'Ann' }).text, 'T-ABC123 (Ann): admitted');
  assert.equal(describeScan(tok, { result: 'void' }).text, 'QR aaaaaaaa: ticket is void, do not admit');
});
