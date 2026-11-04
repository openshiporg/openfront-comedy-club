import { test } from 'node:test'; import assert from 'node:assert/strict';
import { slotLinkExpiry, checkSlotLink, slotTerms, RESPONSES } from './slotLink';
const now = new Date('2026-11-05T12:00:00Z');
test('expiry is 14 days, never past the show start', () => {
  assert.equal(slotLinkExpiry(now, new Date('2027-01-01T00:00:00Z')).toISOString(), '2026-11-19T12:00:00.000Z');
  assert.equal(slotLinkExpiry(now, new Date('2026-11-06T00:00:00Z')).toISOString(), '2026-11-06T00:00:00.000Z');
});
test('link check: wrong, missing, expired, and valid', () => {
  const slot = { responseTokenHash: 'h1', responseTokenExpiresAt: new Date('2026-11-06T00:00:00Z') };
  assert.deepEqual(checkSlotLink(slot, 'h1', now), { ok: true });
  assert.deepEqual(checkSlotLink(slot, 'h2', now), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkSlotLink({ ...slot, responseTokenHash: '' }, '', now), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkSlotLink(null, 'h1', now), { ok: false, reason: 'invalid' });
  assert.deepEqual(checkSlotLink({ ...slot, responseTokenExpiresAt: now }, 'h1', now), { ok: false, reason: 'expired' });
});
test('terms show total pay and only offered slots can be answered', () => {
  const t = slotTerms({ role: 'feature', setMinutes: 25, feeCents: 15000, bonusCents: 2500, status: 'offered' });
  assert.equal(t.totalCents, 17500); assert.equal(t.canRespond, true);
  assert.equal(slotTerms({ role: 'feature', setMinutes: 25, feeCents: 0, bonusCents: 0, status: 'confirmed' }).canRespond, false);
  assert.deepEqual(RESPONSES, { confirm: 'confirmed', decline: 'declined' });
});
