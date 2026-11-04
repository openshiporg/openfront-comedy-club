import { test } from 'node:test'; import assert from 'node:assert/strict';
import { saleState, assertValidWindow } from './saleWindow';
const now = new Date('2026-11-04T12:00:00Z'); const at = (h: number) => new Date(now.getTime() + h * 3600000);
test('window states', () => {
  assert.equal(saleState({ status: 'on_sale' }, now), 'open');
  assert.equal(saleState({ status: 'on_sale', salesStartAt: at(1) }, now), 'scheduled');
  assert.equal(saleState({ status: 'on_sale', salesStartAt: at(-1), salesEndAt: at(1) }, now), 'open');
  assert.equal(saleState({ status: 'on_sale', salesEndAt: at(0) }, now), 'ended', 'end instant is exclusive');
  assert.equal(saleState({ status: 'on_sale', salesStartAt: at(0) }, now), 'open', 'start instant is inclusive');
  assert.equal(saleState({ status: 'paused', salesStartAt: at(-1) }, now), 'paused');
  assert.equal(saleState({ status: 'sold_out' }, now), 'closed');
});
test('window validation', () => {
  const show = at(48);
  assertValidWindow(at(1), at(24), show); assertValidWindow(null, null, show);
  assert.throws(() => assertValidWindow(at(5), at(5), show), /after on-sale/);
  assert.throws(() => assertValidWindow(at(5), at(4), show), /after on-sale/);
  assert.throws(() => assertValidWindow(null, at(49), show), /after the show/);
  assert.throws(() => assertValidWindow(at(48), null, show), /before the show/);
  assert.throws(() => assertValidWindow(new Date('x'), null, show), /Invalid/);
});
