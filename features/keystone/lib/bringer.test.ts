import { test } from 'node:test'; import assert from 'node:assert/strict';
import { addBringerSignup, recordBringerArrival } from '../mutations/openMic';
const ctx: any = { session: { itemId: 'u', data: {} } };
test('bringer commands require permission and valid counts', async () => {
  await assert.rejects(() => addBringerSignup(null, { showId: 's', name: 'A', email: 'a@b.c', guestsRequired: 2, idempotencyKey: 'k' }, {}), /authorized/);
  await assert.rejects(() => recordBringerArrival(null, { signupId: 's', guests: 1, idempotencyKey: 'k' }, {}), /authorized/);
});
