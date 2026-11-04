import { test } from 'node:test'; import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { expireUnderLock } from '../mutations/tickets';

// Regression: hold expiry once filtered promoRedemption by `holdId`, a column that lives on
// InventoryHold, not PromoRedemption. Prisma rejects that at runtime, so every expiry threw.
// This runs the real expiry code against a fake tx that rejects any `where` key the model does not have.
const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name.charAt(0).toLowerCase() + m.name.slice(1), new Set(m.fields.map((f) => f.name))]));
const LOGIC = new Set(['AND', 'OR', 'NOT']);
function checkWhere(model: string, where: any, path = model) {
  const fields = models.get(model); assert(fields, `unknown model ${model}`);
  for (const [key, value] of Object.entries(where || {})) {
    if (LOGIC.has(key)) { for (const w of ([] as any[]).concat(value)) checkWhere(model, w, path); continue; }
    assert(fields.has(key), `Unknown field "${key}" in where for ${path}`);
  }
}
function fakeTx(calls: string[]) {
  const hold = { id: 'h1', priceTierId: 't1', quantity: 2, showId: 's1', status: 'active' };
  return new Proxy({}, { get: (_t, model: string) => {
    if (model === '$queryRaw') return async () => [{ locked: true }];
    return new Proxy({}, { get: (_m, method: string) => async (args: any = {}) => {
      if (args.where) checkWhere(model, args.where);
      calls.push(`${model}.${method}`);
      if (model === 'inventoryHold' && method === 'findMany') return [hold];
      if (method === 'count') return 0;
      if (method === 'findMany') return [];
      return null;
    } });
  } });
}

test('hold expiry only filters on fields that exist, and releases its promo redemption', async () => {
  const calls: string[] = [];
  const n = await expireUnderLock(fakeTx(calls), 's1', { session: null });
  assert.equal(n, 1);
  assert(calls.includes('promoRedemption.updateMany'), 'promo redemption must be released');
  assert(calls.includes('tableOccupancy.updateMany') && calls.includes('priceTier.update'));
});

test('the guard itself rejects a column that is not on the model', () => {
  assert.throws(() => checkWhere('promoRedemption', { holdId: 'h1', status: 'reserved' }), /Unknown field "holdId"/);
  assert.doesNotThrow(() => checkWhere('promoRedemption', { hold: { id: 'h1' }, status: 'reserved' }));
});
