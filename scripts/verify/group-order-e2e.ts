// Opt-in end-to-end check: scratch DB + Stripe TEST. A multi-tier party hold is paid with a real test card,
// settled through the signed webhook, then partially refunded by line price.
// Run: node --import tsx scripts/verify/group-order-e2e.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const l of fs.readFileSync(new URL('../../.env', import.meta.url).pathname, 'utf8').split('\n')) { const m = l.match(/^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'TEST key only'); assert(process.env.STRIPE_WEBHOOK_SECRET, 'webhook secret needed');
import { createTicketHold, applyPromoToHold } from '../../features/keystone/mutations/tickets';
import { startTicketCheckout, completeTicketCheckout, refundTicketOrder } from '../../features/keystone/mutations/checkout';
import { handlePaymentWebhook } from '../../features/keystone/mutations/paymentWebhook';
const p = new PrismaClient(); const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY); const k = () => randomUUID();
async function main() { let showId = ''; try {
  const anon: any = { prisma: p, session: null };
  const owner = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(owner);
  const staff: any = { prisma: p, session: { itemId: owner.id, data: { role: owner.role } } };
  const room = await p.room.findFirst(); assert(room);
  const show = await p.show.create({ data: { title: 'GROUP E2E FIXTURE', startsAt: new Date(Date.now() + 30 * 3600e3), doorsAt: new Date(Date.now() + 29 * 3600e3), status: 'on_sale', roomId: room.id, capacity: 30, occurrenceKey: 'ge-' + randomUUID() } as any }); showId = show.id;
  const ga = await p.priceTier.create({ data: { showId, name: 'GA', priceCents: 2500, feeCents: 300, capacity: 20, status: 'on_sale' } as any });
  const vip = await p.priceTier.create({ data: { showId, name: 'VIP', priceCents: 6000, feeCents: 300, capacity: 5, status: 'on_sale' } as any });
  const tiers = async () => Object.fromEntries((await p.priceTier.findMany({ where: { showId } })).map((t: any) => [t.name, [t.sold, t.held]]));

  // 1) real hold across two tiers, real checkout (creates the real PaymentIntent)
  const hold = await createTicketHold(null, { showId, lines: [{ tierId: ga.id, quantity: 3 }, { tierId: vip.id, quantity: 2 }], idempotencyKey: k() }, anon);
  assert.deepEqual(await tiers(), { GA: [0, 3], VIP: [0, 2] });
  // a 10% promotion on the whole party, applied before checkout
  const promo = await p.promoCode.create({ data: { code: 'GE' + k().slice(0, 6).toUpperCase(), discountType: 'percent_bps', value: 1000, status: 'active', maxUses: 5, perOrderLimit: 99 } as any });
  assert.deepEqual(await applyPromoToHold(null, { holdKey: hold.holdKey, cartToken: hold.cartToken, code: promo.code, idempotencyKey: k() }, anon), { applied: true });
  const co: any = await startTicketCheckout(null, { holdKey: hold.holdKey, cartToken: hold.cartToken, customer: { name: 'Gia Group', email: 'gia-group@example.test' }, ageAttested: true, idempotencyKey: k() }, anon);
  const order = await p.ticketOrder.findUnique({ where: { orderNumber: co.orderNumber }, include: { lines: true, paymentCollection: { include: { paymentSessions: true } } } }); assert(order);
  assert.equal(order.lines.length, 2); assert.equal(order.status, 'pending_payment');
  const byTier = (o: any) => Object.fromEntries(o.lines.map((l: any) => [l.tierName, l]));
  assert.equal(byTier(order).GA.discountCents, 750, '10% of the GA line (3 x 25.00)'); assert.equal(byTier(order).VIP.discountCents, 1200, '10% of the VIP line (2 x 60.00)');
  assert.equal(order.discountCents, 1950); assert.equal(order.lines.reduce((n: number, l: any) => n + l.taxCents, 0), order.taxCents);
  const intentId = (order.paymentCollection!.paymentSessions.find((s: any) => s.isSelected) as any).data.paymentIntentId as string;
  const pi0 = await stripe.paymentIntents.retrieve(intentId); assert.equal(pi0.amount, order.totalCents, 'Stripe charges the quoted total'); assert.equal(pi0.metadata.orderId, order.id);

  // 2) the guest's card is charged for real (what the browser does with Stripe Elements)
  const paid = await stripe.paymentIntents.confirm(intentId, { payment_method: 'pm_card_visa', return_url: 'https://example.test/return' });
  assert.equal(paid.status, 'succeeded');
  assert.equal(await p.payment.count({ where: { orderId: order.id } }), 0, 'nothing is marked paid before settlement');

  // 3) settlement through the signed webhook (payload built from the real intent, signed with the real secret)
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const raw = JSON.stringify({ id: 'evt_' + k().replace(/-/g, ''), object: 'event', type: 'payment_intent.succeeded', livemode: false, data: { object: intent } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  assert.deepEqual(await handlePaymentWebhook(anon, raw, { 'stripe-signature': signature }), { success: true, status: 'processed' });
  assert.deepEqual(await handlePaymentWebhook(anon, raw, { 'stripe-signature': signature }), { success: true, status: 'processed', duplicate: true }, 'the same event is acknowledged, not reprocessed');
  await assert.rejects(() => handlePaymentWebhook(anon, raw + ' ', { 'stripe-signature': signature }), /signature/, 'a tampered body is refused');
  // the buyer's own completion poll and the webhook can race: still one payment
  assert.equal((await completeTicketCheckout(null, { orderNumber: order.orderNumber, orderSecret: co.orderSecret }, anon)).status, 'paid');

  // 4) outcome: one payment, tickets per line, held -> sold per tier, hold converted
  const payments = await p.payment.findMany({ where: { orderId: order.id } }); assert.equal(payments.length, 1, 'exactly one payment'); assert.equal(payments[0].amount, order.totalCents); assert.equal(payments[0].providerPaymentId, intentId);
  const fresh0 = await p.ticketOrder.findUnique({ where: { id: order.id }, include: { lines: true, tickets: true } }); assert(fresh0); const fresh = fresh0; assert.equal(fresh.status, 'paid'); const total = fresh.totalCents as number; assert(total > 0);
  const perLine = Object.fromEntries(fresh.lines.map((l: any) => [l.tierName, fresh.tickets.filter((t: any) => t.lineId === l.id).length])); assert.deepEqual(perLine, { GA: 3, VIP: 2 });
  assert.equal(fresh.tickets.length, 5); assert(fresh.tickets.every((t: any) => t.status === 'valid'));
  assert.deepEqual(await tiers(), { GA: [3, 0], VIP: [2, 0] }, 'held became sold in each tier');
  assert.equal((await p.inventoryHold.findUnique({ where: { holdKey: hold.holdKey } }))!.status, 'converted');
  assert.equal(fresh.lines.reduce((n: number, l: any) => n + l.lineTotalCents, 0), fresh.subtotalCents); assert.equal(fresh.lines.reduce((n: number, l: any) => n + l.taxCents, 0), fresh.taxCents);
  assert.equal((await p.promoRedemption.findFirst({ where: { orderId: order.id } }))!.status, 'committed'); assert.equal((await p.promoCode.findUnique({ where: { id: promo.id } }))!.usedCount, 1);
  assert.equal(await p.paymentWebhookEvent.count({ where: { providerEventId: JSON.parse(raw).id, status: 'processed' } }), 1);

  // 5) one partial refund of ONE VIP ticket: weighted by price, not by count
  const weights = 3 * (2250 + 300) + 2 * (5400 + 300); // what each ticket really paid: its net price after the promotion, plus its fee
  const expectVip = Math.floor(total * 5700 / weights); const countShare = Math.floor(total / 5);
  assert.notEqual(expectVip, countShare, 'the test would not tell weighting from counting');
  const vipTicket = fresh.tickets.find((t: any) => t.lineId === fresh.lines.find((l: any) => l.tierName === 'VIP')!.id)!;
  const rk = k(); const r: any = await refundTicketOrder(null, { orderId: order.id, ticketIds: [vipTicket.id], reason: 'Group e2e partial refund', idempotencyKey: rk }, staff);
  assert.equal(r.status, 'succeeded'); assert.equal(r.amountCents, expectVip, 'refund is the VIP line share of the total');
  const refunds = await p.refund.findMany({ where: { orderId: order.id } }); assert.equal(refunds.length, 1); assert.equal(refunds[0].amount, expectVip); assert(refunds[0].providerRefundId.startsWith('re_'));
  const sr = await stripe.refunds.list({ payment_intent: intentId }); assert.equal(sr.data.length, 1, 'exactly one refund at Stripe'); assert.equal(sr.data[0].amount, expectVip); assert.equal(sr.data[0].id, refunds[0].providerRefundId);
  assert.deepEqual(await tiers(), { GA: [3, 0], VIP: [1, 0] }, 'only the VIP tier gives a seat back');
  const after = await p.ticketOrder.findUnique({ where: { id: order.id } }); assert.equal(after!.status, 'partially_refunded');
  assert.equal((await p.payment.findUnique({ where: { id: payments[0].id } }))!.refundedAmount, expectVip);
  // replay must not refund twice
  await refundTicketOrder(null, { orderId: order.id, ticketIds: [vipTicket.id], reason: 'Group e2e partial refund', idempotencyKey: rk }, staff).catch(() => {});
  assert.equal((await stripe.refunds.list({ payment_intent: intentId })).data.length, 1, 'still one refund at Stripe after replay');
  // a GA ticket refund is the GA share
  const gaTicket = fresh.tickets.find((t: any) => t.lineId === fresh.lines.find((l: any) => l.tierName === 'GA')!.id)!;
  const r2: any = await refundTicketOrder(null, { orderId: order.id, ticketIds: [gaTicket.id], reason: 'Group e2e GA refund', idempotencyKey: k() }, staff);
  // each ticket carries its own line price's share of the order total, so a GA ticket is 2550/19050 of it (net price plus fee)
  assert.equal(r2.amountCents, Math.floor(total * 2550 / weights)); assert(r2.amountCents < expectVip, 'a GA ticket refunds less than a VIP ticket');
  assert.deepEqual(await tiers(), { GA: [2, 0], VIP: [1, 0] });
  console.log('PASS group order e2e', intentId, 'vip refund', expectVip, 'vs count share', countShare, 'ga refund', r2.amountCents);
} finally {
  // orders, payments, refunds and audit rows reference the show, so it is cancelled rather than deleted
  if (showId) await p.show.update({ where: { id: showId }, data: { status: 'cancelled' } });
  await p.promoCode.updateMany({ where: { code: { startsWith: 'GE' }, usedCount: 0 }, data: { status: 'paused' } }).catch(() => {});
  await p.$disconnect();
} }
main();
