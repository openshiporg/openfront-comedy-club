import { test } from 'node:test'; import assert from 'node:assert/strict';
import { checkLines, checkCapacity, normalizeLines, quoteGroup, allocate, ticketWeight, heldByTier, refundShare, MAX_GROUP_HOLD } from './groupHold';
import { quote } from './money';
const tier = (id: string, over: any = {}) => ({ id, showId: 's', status: 'on_sale', capacity: 10, sold: 0, held: 0, name: id, ...over });

test('single-tier input becomes one line; a lines list is used as given', () => {
  assert.deepEqual(normalizeLines({ tierId: 'a', quantity: 2 }), [{ tierId: 'a', quantity: 2, tableIds: undefined }]);
  assert.equal(normalizeLines({ lines: [{ tierId: 'a', quantity: 1 }, { tierId: 'b', quantity: 3 }] }).length, 2);
});
test('shape: no empty lines, no repeated tier, no zero or fractional quantity, size limits', () => {
  assert.throws(() => checkLines([]), /Choose tickets/);
  assert.throws(() => checkLines([{ tierId: 'a', quantity: 1 }, { tierId: 'a', quantity: 1 }]), /once/);
  assert.throws(() => checkLines([{ tierId: 'a', quantity: 0 }]), /at least one/);
  assert.throws(() => checkLines([{ tierId: 'a', quantity: 1.5 }]), /at least one/);
  assert.throws(() => checkLines([{ tierId: 'a', quantity: 21 }]), /1–20/);
  assert.throws(() => checkLines([{ tierId: 'a', quantity: 20 }, { tierId: 'b', quantity: MAX_GROUP_HOLD - 19 }]), /limited to/);
  assert.equal(checkLines([{ tierId: 'a', quantity: 20 }, { tierId: 'b', quantity: 20 }]).total, 40);
});
test('capacity is all or nothing: one short tier fails the whole party, and so does the show total', () => {
  const tiers = [tier('a'), tier('b', { sold: 8, held: 1 })];
  assert.doesNotThrow(() => checkCapacity([{ tierId: 'a', quantity: 4 }, { tierId: 'b', quantity: 1 }], tiers, 's', 50));
  assert.throws(() => checkCapacity([{ tierId: 'a', quantity: 4 }, { tierId: 'b', quantity: 2 }], tiers, 's', 50), /Not enough capacity in b/);
  assert.throws(() => checkCapacity([{ tierId: 'a', quantity: 4 }, { tierId: 'b', quantity: 1 }], tiers, 's', 4), /Not enough capacity/);
  assert.throws(() => checkCapacity([{ tierId: 'a', quantity: 1 }], [tier('a', { status: 'paused' })], 's', 9), /unavailable/);
  assert.throws(() => checkCapacity([{ tierId: 'a', quantity: 1 }], [tier('a', { showId: 'other' })], 's', 9), /unavailable/);
});
test('one line quotes exactly like the existing quote, with or without a promotion', () => {
  const l = { priceCents: 2500, feeCents: 300, quantity: 3 };
  const bare = (q: any) => { const { lines: _l, ...r } = q; return r; };
  assert.deepEqual(bare(quoteGroup([l], 500, 825)), quote({ ...l, serviceFeeBps: 500, taxBps: 825 }));
  const promo = { discountType: 'percent_bps', discountValue: 1000, perOrderLimit: 2 };
  assert.deepEqual(bare(quoteGroup([l], 500, 825, promo)), quote({ ...l, serviceFeeBps: 500, taxBps: 825, ...promo }));
});
test('several tiers: totals add up and equal the sum of the parts; a promotion no longer changes the sum rule', () => {
  const lines = [{ priceCents: 2500, feeCents: 300, quantity: 2 }, { priceCents: 4000, feeCents: 300, quantity: 3 }];
  const q = quoteGroup(lines, 500, 825);
  assert.equal(q.subtotalCents, 2500 * 2 + 4000 * 3);
  assert.equal(q.feesCents, 300 * 5 + Math.floor((17000 * 500 + 5000) / 10000));
  assert.equal(q.totalCents, q.subtotalCents + q.feesCents + q.taxCents); assert.equal(q.discountCents, 0);
});
test('line tax and discount add back to the order, with no cent lost', () => {
  const lines = [{ priceCents: 3333, feeCents: 0, quantity: 1 }, { priceCents: 1000, feeCents: 0, quantity: 3 }, { priceCents: 777, feeCents: 0, quantity: 2 }];
  for (const promo of [null, { discountType: 'percent_bps', discountValue: 1500 }, { discountType: 'amount_cents', discountValue: 1001 }, { discountType: 'comp' }]) {
    const q = quoteGroup(lines, 0, 825, promo);
    assert.equal(q.lines.reduce((n, l) => n + l.taxCents, 0), q.taxCents); assert.equal(q.lines.reduce((n, l) => n + l.discountCents, 0), q.discountCents);
    assert.equal(q.lines.reduce((n, l) => n + l.subtotalCents, 0), q.subtotalCents); assert.equal(q.totalCents, q.subtotalCents + q.feesCents - q.discountCents + q.taxCents);
    for (const l of q.lines) assert(l.discountCents <= l.subtotalCents);
  }
});
test('a promotion on a party is split pro rata by line subtotal, remainder on the last line', () => {
  const lines = [{ priceCents: 2500, feeCents: 0, quantity: 3 }, { priceCents: 6000, feeCents: 0, quantity: 2 }]; // 7500 + 12000
  const pct = quoteGroup(lines, 0, 0, { discountType: 'percent_bps', discountValue: 1000, perOrderLimit: 99 });
  assert.equal(pct.discountCents, 1950); assert.deepEqual(pct.lines.map((l) => l.discountCents), [750, 1200]);
  const flat = quoteGroup(lines, 0, 0, { discountType: 'amount_cents', discountValue: 1000, perOrderLimit: 99 });
  assert.deepEqual(flat.lines.map((l) => l.discountCents), [384, 616]); assert.equal(flat.totalCents, 19500 - 1000);
  const big = quoteGroup(lines, 0, 0, { discountType: 'amount_cents', discountValue: 99999, perOrderLimit: 99 }); assert.equal(big.discountCents, 19500); assert.equal(big.totalCents, 0);
});
test('perOrderLimit discounts only the cheapest units of the party', () => {
  const lines = [{ priceCents: 2500, feeCents: 0, quantity: 3 }, { priceCents: 6000, feeCents: 0, quantity: 2 }];
  const q = quoteGroup(lines, 0, 0, { discountType: 'comp', perOrderLimit: 1 }); assert.equal(q.discountCents, 2500);
  const two = quoteGroup(lines, 0, 0, { discountType: 'percent_bps', discountValue: 5000, perOrderLimit: 4 }); assert.equal(two.discountCents, Math.floor((2500 * 3 + 6000) / 2));
  assert.throws(() => quoteGroup(lines, 0, 0, { discountType: 'comp', perOrderLimit: 0 }));
});
test('allocate never exceeds a cap and always sums to the total', () => {
  assert.deepEqual(allocate(10, [1, 1, 1], [10, 10, 10]), [3, 3, 4]); assert.deepEqual(allocate(0, [1, 2], [5, 5]), [0, 0]);
  assert.deepEqual(allocate(9, [5, 5], [2, 20]).reduce((a, b) => a + b, 0), 9);
  assert.throws(() => allocate(30, [1, 1], [5, 5]));
});
test('a discounted ticket weighs its own net price plus fee when refunding', () => {
  const vip = { lineTotalCents: 12000, discountCents: 1200, quantity: 2, unitFeeCents: 300 }, ga = { lineTotalCents: 7500, discountCents: 750, quantity: 3, unitFeeCents: 300 };
  assert.equal(ticketWeight(vip), 5400 * 1000 + 300 * 1000); assert.equal(ticketWeight(ga), 2250 * 1000 + 300 * 1000); assert.equal(ticketWeight(null), 0);
  assert.equal(ticketWeight({ unitPriceCents: 2500, unitFeeCents: 0 }), 2500 * 1000);
});
test('held seats come from the lines, or from the hold itself when it has none', () => {
  assert.deepEqual(heldByTier({ priceTierId: 'a', quantity: 5 }, [{ priceTierId: 'a', quantity: 2 }, { priceTierId: 'b', quantity: 3 }]), [{ tierId: 'a', quantity: 2 }, { tierId: 'b', quantity: 3 }]);
  assert.deepEqual(heldByTier({ priceTierId: 'a', quantity: 4 }, []), [{ tierId: 'a', quantity: 4 }]);
  assert.deepEqual(heldByTier({}, []), []);
});
test('default partial refund follows each ticket price; one tier matches the old count share', () => {
  const all = [{ priceCents: 2000 }, { priceCents: 2000 }, { priceCents: 4000 }];
  assert.equal(refundShare(10000, [{ priceCents: 4000 }], all), 5000);
  assert.equal(refundShare(10000, [{ priceCents: 2000 }], all), 2500);
  assert.equal(refundShare(9000, [{ priceCents: 3000 }], [{ priceCents: 3000 }, { priceCents: 3000 }, { priceCents: 3000 }]), Math.floor(9000 * 1 / 3));
  assert.equal(refundShare(900, [{ priceCents: 0 }], [{ priceCents: 0 }, { priceCents: 0 }, { priceCents: 0 }]), 300);
});
