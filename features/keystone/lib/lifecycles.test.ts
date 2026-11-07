import assert from 'node:assert/strict';
import { test } from 'node:test';
import { showTransitions } from '../mutations/operators';

test('publishShow cannot cancel or settle a show: those have their own commands with refunds and settlement', () => {
  for (const [from, targets] of Object.entries(showTransitions)) {
    assert.ok(!targets.includes('cancelled'), `${from} -> cancelled must go through cancelShow`);
    assert.ok(!targets.includes('settled'), `${from} -> settled must go through closeShow`);
  }
});

test('shows only move forward through the night', () => {
  assert.deepEqual(showTransitions.draft, ['on_sale']);
  assert.ok(showTransitions.sold_out.includes('doors_open'));
  assert.equal((showTransitions as Record<string, string[]>).completed, undefined);
  assert.equal((showTransitions as Record<string, string[]>).cancelled, undefined);
});

import { refundOutcome } from '../utils/paymentState';
test('a manual-tender refund ("refunded") settles like a Stripe one ("succeeded")', () => {
  assert.equal(refundOutcome('succeeded'), 'succeeded');
  assert.equal(refundOutcome('refunded'), 'succeeded');
  assert.equal(refundOutcome('failed'), 'failed');
  assert.equal(refundOutcome('pending'), 'unknown');
  assert.equal(refundOutcome(undefined), 'unknown');
});
