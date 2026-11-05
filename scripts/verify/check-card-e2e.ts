// Opt-in Stripe TEST check against the scratch DB: card tender on a bar check.
// 1) start: bill frozen (presented), one pending payment, intent for the exact total; replay and a second start reuse it; items and close refused meanwhile.
// 2) cancel: intent cancelled at Stripe, check reopened. 3) pay with pm_card_visa: Stripe re-read, check paid, tables freed;
// the signed webhook for the same intent is processed idempotently. 4) declined card stays unpaid. Every charge is refunded at the end.
// Run: node --import tsx scripts/verify/check-card-e2e.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict';
import { issueComp, closeCheck } from '../../features/keystone/mutations/night';
import { seatParty, openCheck, addCheckItem } from '../../features/keystone/mutations/operators';
import { startCheckCardPayment, completeCheckCardPayment, cancelCheckCardPayment } from '../../features/keystone/mutations/checkPay';
import { handlePaymentWebhook } from '../../features/keystone/mutations/paymentWebhook';
const p = new PrismaClient(); const k = () => randomUUID();
assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Stripe TEST only');
const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY);
async function main() { const shows: string[] = []; const charged: string[] = []; try {
  const ou = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(ou);
  const staff: any = { prisma: p, session: { itemId: ou.id, data: { role: ou.role } } };
  const room = await p.room.findFirst({ where: { seatingMode: 'tables', active: true }, include: { sections: { include: { tables: { orderBy: { label: 'asc' } } } } } }); assert(room);
  const twos = room.sections.flatMap((s: any) => s.tables).filter((t: any) => t.seats >= 2);
  const menu = await p.menuItem.findMany({ where: { active: true }, orderBy: { priceCents: 'desc' }, take: 2 });
  const d = new Date(Date.now() + 864e5); const show = await p.show.create({ data: { title: 'CHECK CARD CHECK', startsAt: d, doorsAt: new Date(d.getTime() - 36e5), endsAt: new Date(d.getTime() + 54e5), status: 'on_sale', roomId: room.id, capacity: 40, occurrenceKey: 'cc-' + k() } as any }); shows.push(show.id);
  const tier = await p.priceTier.create({ data: { showId: show.id, name: 'GA', priceCents: 2000, feeCents: 0, capacity: 40, status: 'on_sale' } as any });
  const party = async (name: string, table: any) => { await issueComp(null, { showId: show.id, tierId: tier.id, quantity: 2, recipientName: name, recipientEmail: `${name.toLowerCase()}@example.test`, reason: 'press', idempotencyKey: k() }, staff); const o = (await p.ticketOrder.findFirst({ where: { showId: show.id, name } }))!; return seatParty(null, { orderId: o.id, tableIds: [table.id], showId: show.id, idempotencyKey: k() }, staff) as any; };
  const sa = await party('Alpha', twos[0]);
  const check: any = await openCheck(null, { seatingAssignmentId: sa.id, idempotencyKey: k() }, staff);
  for (const m of menu) await addCheckItem(null, { checkId: check.id, menuItemId: m.id, qty: 2, idempotencyKey: k() }, staff);
  await assert.rejects(startCheckCardPayment(null, { checkId: check.id, tipCents: -1, idempotencyKey: k() }, staff), /Tip/);
  // 1) start
  const key = k(); const s1: any = await startCheckCardPayment(null, { checkId: check.id, tipCents: 500, idempotencyKey: key }, staff);
  const c1 = (await p.check.findUnique({ where: { id: check.id } }))!; assert.equal(c1.status, 'presented'); assert.equal(s1.amountCents, c1.totalCents); assert.equal(c1.tipCents, 500);
  const pay1 = (await p.payment.findUnique({ where: { id: s1.paymentId } }))!; assert(pay1.providerPaymentId.startsWith('pi_')); charged.push(pay1.providerPaymentId);
  const pi1 = await stripe.paymentIntents.retrieve(pay1.providerPaymentId); assert.equal(pi1.amount, c1.totalCents); assert.equal(pi1.metadata.checkPaymentId, pay1.id);
  const s1r: any = await startCheckCardPayment(null, { checkId: check.id, tipCents: 500, idempotencyKey: key }, staff); assert.equal(s1r.paymentId, s1.paymentId);
  const s1b: any = await startCheckCardPayment(null, { checkId: check.id, tipCents: 0, idempotencyKey: k() }, staff); assert.equal(s1b.paymentId, s1.paymentId, 'a live payment is resumed, not doubled');
  await assert.rejects(addCheckItem(null, { checkId: check.id, menuItemId: menu[0].id, qty: 1, idempotencyKey: k() }, staff), /Invalid check item/);
  await assert.rejects(closeCheck(null, { checkId: check.id, idempotencyKey: k() }, staff), /card payment is in progress/);
  assert.equal((await completeCheckCardPayment(null, { checkId: check.id, paymentId: s1.paymentId }, staff) as any).status, 'pending', 'unpaid intent is not settled');
  // 2) cancel
  const cx: any = await cancelCheckCardPayment(null, { checkId: check.id, paymentId: s1.paymentId, reason: 'Guest pays cash', idempotencyKey: k() }, staff); assert.equal(cx.status, 'cancelled');
  assert.equal((await stripe.paymentIntents.retrieve(pay1.providerPaymentId)).status, 'canceled'); assert.equal((await p.check.findUnique({ where: { id: check.id } }))!.status, 'open');
  await assert.rejects(cancelCheckCardPayment(null, { checkId: check.id, paymentId: s1.paymentId, idempotencyKey: k() }, staff), /cancelled/);
  // 4) declined card
  const s2: any = await startCheckCardPayment(null, { checkId: check.id, tipCents: 0, idempotencyKey: k() }, staff); assert.notEqual(s2.paymentId, s1.paymentId);
  const pay2 = (await p.payment.findUnique({ where: { id: s2.paymentId } }))!; charged.push(pay2.providerPaymentId);
  await stripe.paymentIntents.confirm(pay2.providerPaymentId, { payment_method: 'pm_card_chargeDeclined', return_url: 'https://example.test/r' }).catch(() => {});
  assert.equal((await completeCheckCardPayment(null, { checkId: check.id, paymentId: s2.paymentId }, staff) as any).status, 'declined');
  assert.equal((await p.check.findUnique({ where: { id: check.id } }))!.status, 'presented', 'declined card leaves the check presented');
  await cancelCheckCardPayment(null, { checkId: check.id, paymentId: s2.paymentId, reason: 'Declined', idempotencyKey: k() }, staff);
  // 3) pay
  const s3: any = await startCheckCardPayment(null, { checkId: check.id, tipCents: 700, idempotencyKey: k() }, staff);
  const pay3 = (await p.payment.findUnique({ where: { id: s3.paymentId } }))!; charged.push(pay3.providerPaymentId);
  const confirmed = await stripe.paymentIntents.confirm(pay3.providerPaymentId, { payment_method: 'pm_card_visa', return_url: 'https://example.test/r' }); assert.equal(confirmed.status, 'succeeded');
  assert.equal((await completeCheckCardPayment(null, { checkId: check.id, paymentId: s3.paymentId }, staff) as any).status, 'paid');
  const c3 = (await p.check.findUnique({ where: { id: check.id } }))!; assert.equal(c3.status, 'paid'); assert.equal(c3.totalCents, confirmed.amount_received); assert.equal(c3.tipCents, 700);
  assert.equal((await p.payment.findUnique({ where: { id: s3.paymentId } }))!.status, 'succeeded');
  assert.equal((await p.seatingAssignment.findUnique({ where: { id: sa.id } }))!.status, 'closed'); assert.equal(await p.tableOccupancy.count({ where: { assignmentId: sa.id, occupancyKey: { not: null } } }), 0);
  assert.equal((await completeCheckCardPayment(null, { checkId: check.id, paymentId: s3.paymentId }, staff) as any).status, 'paid', 'complete again is a no-op');
  await assert.rejects(startCheckCardPayment(null, { checkId: check.id, idempotencyKey: k() }, staff), /cannot take a card/);
  // signed webhook for the same intent
  const evt = { id: 'evt_check_' + k(), object: 'event', type: 'payment_intent.succeeded', livemode: false, data: { object: await stripe.paymentIntents.retrieve(pay3.providerPaymentId) } };
  const raw = JSON.stringify(evt); const sig = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  assert.deepEqual(await handlePaymentWebhook({ prisma: p }, raw, { 'stripe-signature': sig }), { success: true, status: 'processed' });
  assert.equal(await p.payment.count({ where: { checkId: check.id, status: 'succeeded' } }), 1, 'one succeeded payment');
  // webhook settles on its own when the screen was closed
  const sb = await party('Bravo', twos[1]); const cb: any = await openCheck(null, { seatingAssignmentId: sb.id, idempotencyKey: k() }, staff);
  await addCheckItem(null, { checkId: cb.id, menuItemId: menu[0].id, qty: 3, idempotencyKey: k() }, staff);
  const s4: any = await startCheckCardPayment(null, { checkId: cb.id, idempotencyKey: k() }, staff); const pay4 = (await p.payment.findUnique({ where: { id: s4.paymentId } }))!; charged.push(pay4.providerPaymentId);
  await stripe.paymentIntents.confirm(pay4.providerPaymentId, { payment_method: 'pm_card_visa', return_url: 'https://example.test/r' });
  const evt2 = { id: 'evt_check_' + k(), object: 'event', type: 'payment_intent.succeeded', livemode: false, data: { object: await stripe.paymentIntents.retrieve(pay4.providerPaymentId) } };
  const raw2 = JSON.stringify(evt2); const sig2 = stripe.webhooks.generateTestHeaderString({ payload: raw2, secret: process.env.STRIPE_WEBHOOK_SECRET! });
  assert.deepEqual(await handlePaymentWebhook({ prisma: p }, raw2, { 'stripe-signature': sig2 }), { success: true, status: 'processed' });
  assert.equal((await p.check.findUnique({ where: { id: cb.id } }))!.status, 'paid', 'webhook settled the check');
  assert.equal(await p.auditEvent.count({ where: { targetId: { in: [check.id, cb.id] }, action: { in: ['card_started', 'card_cancelled', 'paid_card'] } } }), 8);
  console.log('PASS check card: start freezes bill (replay/second start reuse one intent), cancel reopens, declined stays unpaid, visa pays and frees tables, webhook idempotent and settles alone;', pay3.providerPaymentId, c3.totalCents);
} finally {
  // refund every TEST charge, cancel anything still open
  for (const id of charged) { try { const pi = await stripe.paymentIntents.retrieve(id); if (pi.status === 'succeeded') { await stripe.refunds.create({ payment_intent: id }); console.log('refunded', id); } else if (!['canceled'].includes(pi.status)) await stripe.paymentIntents.cancel(id); } catch (e: any) { console.error('cleanup', id, e.message); } }
  if (shows.length) { await p.tableOccupancy.updateMany({ where: { showId: { in: shows } }, data: { occupancyKey: null } }); await p.check.updateMany({ where: { showId: { in: shows }, status: { in: ['open', 'presented'] } }, data: { status: 'voided' } }); await p.show.updateMany({ where: { id: { in: shows } }, data: { status: 'cancelled' } }); }
  await p.$disconnect();
} }
main().catch((e) => { console.error(e); process.exit(1); });
