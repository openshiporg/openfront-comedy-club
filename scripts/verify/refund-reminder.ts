import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
// Opt-in check against the scratch DB and Stripe TEST. Run: node --import tsx scripts/verify/refund-reminder.ts
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const l of fs.readFileSync(new URL('../../.env', import.meta.url).pathname, 'utf8').split('\n')) { const m = l.match(/^STRIPE_SECRET_KEY=(.*)$/); if (m) process.env.STRIPE_SECRET_KEY = m[1].replace(/^["']|["']$/g, ''); }
assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'TEST key only');
import { refundTicketOrder } from '../../features/keystone/mutations/checkout';
import { scheduleShowReminders } from '../../features/keystone/mutations/reminders';
const p = new PrismaClient(); const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY); const k = () => randomUUID();
async function main() { const made: any = {}; try {
  const owner = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(owner);
  const c: any = { prisma: p, session: { itemId: owner.id, data: { role: owner.role } } };
  const provider = await p.paymentProvider.findUnique({ where: { code: 'pp_stripe' } }); assert(provider);
  const soon = new Date(Date.now() + 20 * 3600e3); const room = await p.room.findFirst(); assert(room);
  const show = await p.show.create({ data: { title: 'REFUND REMINDER FIXTURE', startsAt: soon, status: 'on_sale', roomId: room.id, capacity: 10, occurrenceKey: 'rr-' + randomUUID() } as any }); made.show = show.id;
  const tier = await p.priceTier.create({ data: { showId: show.id, name: 'GA', priceCents: 2500, feeCents: 0, capacity: 10, sold: 2, status: 'on_sale' } as any });
  // a real TEST payment, confirmed against Stripe
  const pi = await stripe.paymentIntents.create({ amount: 5000, currency: 'usd', payment_method: 'pm_card_visa', confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: 'never' }, metadata: { fixture: 'comedy-club-refund-reminder' } }, { idempotencyKey: 'rr-pi-' + k() });
  assert.equal(pi.status, 'succeeded'); made.pi = pi.id;
  const order = await p.ticketOrder.create({ data: { orderNumber: 'RR-' + randomUUID().slice(0, 6), email: 'refund-reminder@example.test', name: 'Refund Reminder', showId: show.id, status: 'paid', partySize: 2, subtotalCents: 5000, totalCents: 5000 } as any }); made.order = order.id;
  const line = await p.ticketOrderLine.create({ data: { orderId: order.id, tierName: 'GA', unitPriceCents: 2500, quantity: 2, lineTotalCents: 5000, priceTierId: tier.id } as any });
  for (let i = 0; i < 2; i++) await p.ticket.create({ data: { ticketCode: 'RR' + randomUUID().slice(0, 10), orderId: order.id, showId: show.id, lineId: line.id, status: 'valid' } as any });
  const pay = await p.payment.create({ data: { idempotencyKey: 'rr-pay-' + k(), amount: 5000, status: 'succeeded', paymentProviderId: provider.id, providerPaymentId: pi.id, orderId: order.id, currencyCode: 'USD' } as any });
  await scheduleShowReminders(null, { showId: show.id, idempotencyKey: k() }, c);
  const rem = await p.notificationRecord.findFirst({ where: { notificationKey: 'show_reminder:' + order.id } }); assert.equal(rem?.status, 'queued', 'reminder queued before refund');
  // $50 is under the approval threshold, so no manager approval is needed
    const key = k(); const a = { orderId: order.id, reason: 'Refund-path reminder test', idempotencyKey: key };
  let r: any;
  try { r = await refundTicketOrder(null, a, c); } catch (e: any) { console.log('refund error:', e.message); throw e; }
  console.log('refund result', JSON.stringify(r));
  made.refund = r.refundId;
  assert.equal(r.status, 'succeeded');
  const refunds = await p.refund.findMany({ where: { orderId: order.id } });
  assert.equal(refunds.length, 1, 'exactly one refund row'); assert.equal(refunds[0].amount, 5000); assert.equal(refunds[0].status, 'succeeded'); assert(refunds[0].providerRefundId.startsWith('re_'));
  const sr = await stripe.refunds.list({ payment_intent: pi.id }); assert.equal(sr.data.length, 1, 'exactly one refund at Stripe'); assert.equal(sr.data[0].amount, 5000); assert.equal(sr.data[0].status, 'succeeded'); assert.equal(sr.data[0].id, refunds[0].providerRefundId);
  assert.equal((await p.payment.findUnique({ where: { id: pay.id } }))!.refundedAmount, 5000); assert.equal((await p.payment.findUnique({ where: { id: pay.id } }))!.status, 'refunded');
  assert.equal((await p.ticketOrder.findUnique({ where: { id: order.id } }))!.status, 'refunded');
  assert.equal(await p.ticket.count({ where: { orderId: order.id, status: 'refunded' } }), 2); assert.equal((await p.priceTier.findUnique({ where: { id: tier.id } }))!.sold, 0);
  assert.equal((await p.notificationRecord.findUnique({ where: { id: rem!.id } }))!.status, 'cancelled', 'queued reminder cancelled by the refund path');
  const audits = await p.auditEvent.findMany({ where: { targetId: order.id, action: 'refunded' } }); assert.equal(audits.length, 1, 'one refunded audit'); assert.equal(audits[0].reason, 'Refund-path reminder test');
  // replay with the same key must not refund twice
  const r2 = await refundTicketOrder(null, a, c).catch((e: any) => ({ err: e.message })); console.log('replay:', JSON.stringify(r2));
  assert.equal((await stripe.refunds.list({ payment_intent: pi.id })).data.length, 1, 'still one refund at Stripe after replay'); assert.equal(await p.refund.count({ where: { orderId: order.id } }), 1);
  console.log('PASS refund-path reminder cancel (real Stripe TEST refund)', pi.id, refunds[0].providerRefundId);
} finally {
  // the order, payment, refund and audit rows reference the show, so it is cancelled rather than deleted
  if (made.show) await p.show.update({ where: { id: made.show }, data: { status: 'cancelled' } });
  await p.$disconnect();
} }
main();
