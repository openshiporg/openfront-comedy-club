import { test } from 'node:test'; import assert from 'node:assert/strict';
import { transferDecision, normalizeHolder, MAX_TRANSFERS_PER_ORDER, holderAccess, buildHistory } from './transfer';
const base = { ticketStatus: 'valid', orderStatus: 'paid', showStatus: 'on_sale', doorsAt: new Date('2026-11-06T01:00:00Z'), startsAt: new Date('2026-11-06T02:00:00Z'), now: new Date('2026-11-05T12:00:00Z'), current: { name: 'Ana Buyer', email: 'ana@x.test' }, next: { name: 'Ben Friend', email: 'BEN@x.test' }, transfersInOrder: 0 };
const no = (o: any, re: RegExp) => { const d = transferDecision({ ...base, ...o }); assert.equal(d.ok, false); assert.match((d as any).reason, re); };
test('a valid ticket before doors can be transferred', () => assert.deepEqual(transferDecision(base), { ok: true }));
test('refused after check-in, void, refunded', () => { no({ ticketStatus: 'checked_in' }, /scanned in/); no({ ticketStatus: 'void' }, /valid ticket/); no({ ticketStatus: 'refunded' }, /valid ticket/); });
test('refused once doors open; falls back to start time when doors are unset', () => {
  no({ now: new Date('2026-11-06T01:00:00Z') }, /doors/);
  assert.deepEqual(transferDecision({ ...base, doorsAt: null, now: new Date('2026-11-06T01:30:00Z') }), { ok: true });
  no({ doorsAt: null, now: new Date('2026-11-06T02:00:00Z') }, /doors/);
});
test('refused for unpaid orders and closed shows', () => { no({ orderStatus: 'pending_payment' }, /not eligible/); no({ orderStatus: 'refunded' }, /not eligible/); no({ showStatus: 'cancelled' }, /closed/); });
test('validates the new holder and rejects a no-op', () => {
  no({ next: { name: '  ', email: 'b@x.test' } }, /name/); no({ next: { name: 'Ben', email: 'nope' } }, /email/);
  no({ next: { name: ' ana  buyer ', email: 'ANA@x.test' } }, /already/);
  assert.deepEqual(normalizeHolder({ name: '  Ben   F ', email: ' B@X.TEST ' }), { name: 'Ben F', email: 'b@x.test' });
});
test('per-order transfer cap', () => { no({ transfersInOrder: MAX_TRANSFERS_PER_ORDER }, /limit/); assert.equal(transferDecision({ ...base, transfersInOrder: MAX_TRANSFERS_PER_ORDER - 1 }).ok, true); });
test('ticket page access: void only reveals a transfer, everything else is full', () => {
  assert.equal(holderAccess({ status: 'void' }, true), 'transferred');
  assert.equal(holderAccess({ status: 'void' }, false), 'refused');
  for (const st of ['valid', 'checked_in', 'refunded']) assert.equal(holderAccess({ status: st }, false), 'full');
});
test('history is names and hand-off times, never emails; the viewed ticket is not listed as a past holder', () => {
  const h = buildHistory([{ holderName: '', createdAt: new Date('2026-11-01T00:00:00Z') }, { holderName: 'Ben', createdAt: new Date('2026-11-02T00:00:00Z') }, { holderName: 'Cy', createdAt: new Date('2026-11-03T00:00:00Z') }]);
  assert.deepEqual(h.map((x) => x.name), ['Original buyer', 'Ben']);
  assert.deepEqual(h.map((x) => x.at!.toISOString().slice(0, 10)), ['2026-11-02', '2026-11-03']);
  assert.ok(h.every((x) => !('email' in x)));
  assert.deepEqual(buildHistory([{ holderName: 'Ana', createdAt: new Date() }]), []);
});
