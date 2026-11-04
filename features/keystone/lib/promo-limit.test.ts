import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote } from './money';
const input = { priceCents: 2000, feeCents: 100, quantity: 4, serviceFeeBps: 0, taxBps: 1000, perOrderLimit: 1 };
test('percentage promotion discounts only eligible ticket units and tax follows discounted subtotal', () => {
  const q = quote({ ...input, discountType: 'percent_bps', discountValue: 5000 });
  assert.equal(q.discountCents, 1000); assert.equal(q.taxCents, 700); assert.equal(q.feesCents, 400); assert.equal(q.totalCents, 8100);
});
test('comp and fixed promotions cannot discount ineligible units', () => {
  assert.equal(quote({ ...input, discountType: 'comp' }).discountCents, 2000);
  assert.equal(quote({ ...input, discountType: 'amount_cents', discountValue: 9000 }).discountCents, 2000);
  assert.equal(quote({ ...input, perOrderLimit: 8, discountType: 'comp' }).discountCents, 8000);
});
test('invalid promotion limits fail closed', () => {
  for (const perOrderLimit of [0, -1, 1.5, NaN]) assert.throws(() => quote({ ...input, perOrderLimit, discountType: 'comp' }));
});
