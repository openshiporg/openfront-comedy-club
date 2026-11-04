// Opt-in end-to-end check: scratch DB + Stripe TEST. A SINGLE-tier order with a promotion goes through real checkout,
// is paid with a real test card, settled by the signed webhook, and refunded by the discounted amount.
// Run: node --import tsx scripts/verify/promo-order-e2e.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const l of fs.readFileSync(new URL('../../.env', import.meta.url).pathname, 'utf8').split('\n')) { const m = l.match(/^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'TEST key only'); assert(process.env.STRIPE_WEBHOOK_SECRET, 'webhook secret needed');
import { createTicketHold, applyPromoToHold } from '../../features/keystone/mutations/tickets';
import { startTicketCheckout, refundTicketOrder } from '../../features/keystone/mutations/checkout';
import { handlePaymentWebhook } from '../../features/keystone/mutations/paymentWebhook';
const p = new PrismaClient(); const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY); const k = () => randomUUID();
async function main() { let showId = ''; let promoId = ''; try {
  const anon: any = { prisma: p, session: null };
  const owner = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(owner);
  const staff: any = { prisma: p, session: { itemId: owner.id, data: { role: owner.role } } };
  const room = await p.room.findFirst(); assert(room);
  const show = await p.show.create({ data: { title: 'PROMO E2E FIXTURE', startsAt: new Date(Date.now() + 30 * 3600e3), doorsAt: new Date(Date.now() + 29 * 3600e3), status: 'on_sale', roomId: room.id, capacity: 30, occurrenceKey: 'pe-' + randomUUID() } as any }); showId = show.id;
  const tier = await p.priceTier.create({ data: { showId, name: 'GA', priceCents: 3000, feeCents: 300, capacity: 20, status: 'on_sale' } as any });
  const promo = await p.promoCode.create({ data: { code: 'PE' + k().slice(0, 6).toUpperCase(), discountType: 'percent_bps', value: 2000, status: 'active', maxUses: 5, perOrderLimit: 99 } as any }); promoId = promo.id;
  const hold = await createTicketHold(null, { showId, tierId: tier.id, quantity: 3, idempotencyKey: k() }, anon);
  assert.deepEqual(await applyPromoToHold(null, { holdKey: hold.holdKey, cartToken: hold.cartToken, code: promo.code, idempotencyKey: k() }, anon), { applied: true });
  const reserved = await p.promoRedemption.findFirst({ where: { promoCodeId: promo.id } }); assert.equal(reserved?.status, 'reserved');
  assert.equal((await p.inventoryHold.findUnique({ where: { holdKey: hold.holdKey } }))!.redemptionId, reserved!.id);
  const co: any = await startTicketCheckout(null, { holdKey: hold.holdKey, cartToken: hold.cartToken, customer: { name: 'Pia Promo', email: 'pia-promo@example.test' }, ageAttested: true, idempotencyKey: k() }, anon);
  const order = await p.ticketOrder.findUnique({ where: { orderNumber: co.orderNumber }, include: { lines: true, paymentCollection: { include: { paymentSessions: true } } } }); assert(order);
  assert.equal(order.lines.length, 1); assert.equal(order.subtotalCents, 9000); assert.equal(order.discountCents, 1800, '20% of 3 x 30.00'); assert.equal(order.lines[0].discountCents, 1800);
  const intentId = (order.paymentCollection!.paymentSessions.find((s: any) => s.isSelected) as any).data.paymentIntentId as string;
  const pi0 = await stripe.paymentIntents.retrieve(intentId); assert.equal(pi0.amount, order.totalCents, 'Stripe charges the discounted total');
  assert.equal(order.totalCents, 9000 + (order.feesCents as number) - 1800 + (order.taxCents as number), 'total = subtotal + fees - discount + tax'); assert((order.feesCents as number) >= 900);
  assert.equal((await stripe.paymentIntents.confirm(intentId, { payment_method: 'pm_card_visa', return_url: 'https://example.test/return' })).status, 'succeeded');
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const raw = JSON.stringify({ id: 'evt_' + k().replace(/-/g, ''), object: 'event', type: 'payment_intent.succeeded', livemode: false, data: { object: intent } });
  const sig = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  assert.deepEqual(await handlePaymentWebhook(anon, raw, { 'stripe-signature': sig }), { success: true, status: 'processed' });
  const payments = await p.payment.findMany({ where: { orderId: order.id } }); assert.equal(payments.length, 1); assert.equal(payments[0].amount, order.totalCents);
  const red = await p.promoRedemption.findUnique({ where: { id: reserved!.id } }); assert.equal(red!.status, 'committed'); assert.equal(red!.orderId, order.id); assert.equal(red!.amountCents, 1800);
  assert.equal((await p.promoCode.findUnique({ where: { id: promo.id } }))!.usedCount, 1);
  assert.equal((await p.priceTier.findUnique({ where: { id: tier.id } }))!.sold, 3);
  // full refund returns exactly what was charged (the discounted total), once
  const rk = k(); const r: any = await refundTicketOrder(null, { orderId: order.id, reason: 'Promo e2e refund', idempotencyKey: rk }, staff);
  assert.equal(r.status, 'succeeded'); assert.equal(r.amountCents, order.totalCents);
  const sr = await stripe.refunds.list({ payment_intent: intentId }); assert.equal(sr.data.length, 1); assert.equal(sr.data[0].amount, order.totalCents);
  await refundTicketOrder(null, { orderId: order.id, reason: 'Promo e2e refund', idempotencyKey: rk }, staff).catch(() => {});
  assert.equal((await stripe.refunds.list({ payment_intent: intentId })).data.length, 1, 'replay does not refund twice');
  console.log('PASS promo order e2e (single tier)', intentId, 'charged', order.totalCents, 'discount', order.discountCents);
} finally {
  if (showId) await p.show.update({ where: { id: showId }, data: { status: 'cancelled' } });
  if (promoId) await p.promoCode.update({ where: { id: promoId }, data: { status: 'paused' } }).catch(() => {});
  await p.$disconnect();
} }
main();
