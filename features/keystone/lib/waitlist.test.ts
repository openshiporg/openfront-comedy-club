import { test } from 'node:test'; import assert from 'node:assert/strict';
import { planOffers, tierFor, offerExpiry } from './waitlist';
const now = new Date('2026-11-04T12:00:00Z'); const d = (m: number) => new Date(now.getTime() + m * 60000);
const tier = (o: any = {}) => ({ id: 't1', priceCents: 2000, capacity: 10, sold: 8, held: 0, status: 'on_sale', ...o });
const e = (id: string, partySize: number, m: number) => ({ id, partySize, createdAt: d(m) });
test('offers in join order and stops when room runs out', () => {
  const o = planOffers([e('b', 1, 2), e('a', 1, 1), e('c', 1, 3)], [tier()], 2, now);
  assert.deepEqual(o.map((x) => x.entryId), ['a', 'b']);
});
test('a party that is too big is skipped, not blocking', () => {
  assert.deepEqual(planOffers([e('big', 5, 1), e('small', 2, 2)], [tier()], 2, now).map((x) => x.entryId), ['small']);
});
test('tier rules: window, status, table tiers, cheapest first', () => {
  assert.equal(tierFor(1, [tier({ salesStartAt: d(5) })], 5, now), null);
  assert.equal(tierFor(1, [tier({ status: 'paused' })], 5, now), null);
  assert.equal(tierFor(1, [tier({ isTableTier: true })], 5, now), null);
  assert.equal(tierFor(1, [tier({ id: 'vip', priceCents: 5000, sold: 0 }), tier()], 5, now)!.id, 't1');
  assert.equal(tierFor(3, [tier()], 5, now), null, 'party larger than tier room');
});
test('show-level capacity limits offers across tiers', () => {
  const o = planOffers([e('a', 2, 1), e('b', 2, 2)], [tier({ sold: 0, capacity: 50 })], 3, now);
  assert.deepEqual(o.map((x) => x.entryId), ['a']);
});
test('offer expiry is capped at show start', () => {
  assert.equal(offerExpiry(now, d(600))!.getTime(), d(120).getTime());
  assert.equal(offerExpiry(now, d(30))!.getTime(), d(30).getTime());
  assert.equal(offerExpiry(now, d(-1)), null);
});
