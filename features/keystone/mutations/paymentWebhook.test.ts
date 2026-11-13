import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { handlePaymentWebhook } from './paymentWebhook';
process.env.STRIPE_SECRET_KEY = 'sk_test_depth_local';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_depth_local';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const payload = (patch: any = {}) => JSON.stringify({ id: 'evt_depth', type: 'payment_intent.succeeded', livemode: false, data: { object: { id: 'pi_depth', status: 'succeeded', metadata: { orderId: 'o1' } } }, ...patch });
const headers = (raw: string) => ({ 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: raw, secret: process.env.STRIPE_WEBHOOK_SECRET! }) });
test('bad or tampered signatures are refused before the database', async () => {
  await assert.rejects(() => handlePaymentWebhook({ prisma: {} }, payload(), { 'stripe-signature': 'invalid' }), /signature/);
  const raw = payload(); await assert.rejects(() => handlePaymentWebhook({ prisma: {} }, raw + ' ', headers(raw)), /signature/);
});
test('an event whose mode does not match the key mode is refused', async () => { const raw = payload({ livemode: true }); await assert.rejects(() => handlePaymentWebhook({ prisma: {} }, raw, headers(raw)), /does not match/); });
test('duplicates are acknowledged without reprocessing; unsupported ignored; refunds stay failed', async () => {
  const dup = { prisma: { paymentWebhookEvent: { upsert: async () => ({ id: 'i', status: 'processed' }) } } };
  const raw = payload(); assert.deepEqual(await handlePaymentWebhook(dup, raw, headers(raw)), { success: true, status: 'processed', duplicate: true });
  for (const type of ['payment_intent.created', 'refund.updated']) {
    const updates: any[] = []; const ctx = { prisma: { paymentWebhookEvent: { upsert: async () => ({ id: 'i', status: 'received' }), update: async ({ data }: any) => { updates.push(data); return data; } } } };
    const r = payload({ type }); const out = await handlePaymentWebhook(ctx, r, headers(r));
    assert.equal(out.success, type === 'payment_intent.created'); assert.equal(updates.at(-1).status, type === 'refund.updated' ? 'failed' : 'ignored');
  }
});
test('payment for a different intent is rejected and recorded failed', async () => {
  const updates: any[] = [];
  const ctx = { prisma: { paymentWebhookEvent: { upsert: async () => ({ id: 'i', status: 'received' }), update: async ({ data }: any) => { updates.push(data); return data; } }, ticketOrder: { findUnique: async () => ({ id: 'o1', status: 'pending_payment', paymentCollection: { paymentSessions: [{ isSelected: true, data: { paymentIntentId: 'pi_other' } }] } }) } } };
  const raw = payload(); await assert.rejects(() => handlePaymentWebhook(ctx, raw, headers(raw)), /match/); assert.equal(updates.at(-1).status, 'failed');
});
