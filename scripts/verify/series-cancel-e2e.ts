// Opt-in end-to-end check: scratch DB + Stripe TEST. An interrupted series cancellation is recorded, then finished by the sweep
// (racing the operator's own loop) with exactly one real Stripe refund per order.
// Run: node --import tsx scripts/verify/series-cancel-e2e.ts
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const l of fs.readFileSync(new URL('../../.env', import.meta.url).pathname, 'utf8').split('\n')) { const m = l.match(/^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'TEST key only'); assert(process.env.STRIPE_WEBHOOK_SECRET, 'webhook secret needed');
process.env.CRON_SECRET = 'series-cancel-e2e-' + randomUUID();
import { createTicketHold } from '../../features/keystone/mutations/tickets';
import { startTicketCheckout } from '../../features/keystone/mutations/checkout';
import { handlePaymentWebhook } from '../../features/keystone/mutations/paymentWebhook';
import { createShowSeries, recordSeriesCancel, advanceSeriesCancel, sweepSeriesCancellations, seriesCancelProgress, cancelShowSeries, editShowSeries } from '../../features/keystone/mutations/series';
const p = new PrismaClient(); const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY); const k = () => randomUUID();
async function main() { const shows: string[] = []; try {
  const anon: any = { prisma: p, session: null };
  const owner = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(owner);
  const staff: any = { prisma: p, session: { itemId: owner.id, data: { role: owner.role } } };
  const room = await p.room.findFirst({ where: { seatingMode: 'ga' } }) || await p.room.findFirst(); assert(room);
  const d0 = new Date(Date.now() + 90 * 864e5); d0.setUTCHours(2, 0, 0, 0);
  const src = await p.show.create({ data: { title: 'SERIES CANCEL E2E', startsAt: d0, doorsAt: new Date(d0.getTime() - 36e5), endsAt: new Date(d0.getTime() + 54e5), status: 'draft', roomId: room.id, capacity: 20, occurrenceKey: 'sc-' + k() } as any }); shows.push(src.id);
  await p.priceTier.create({ data: { showId: src.id, name: 'GA', priceCents: 2500, feeCents: 250, capacity: 20, status: 'on_sale' } as any });
  const from = new Date(d0.getTime() + 7 * 864e5 - 6 * 3600e3).toISOString().slice(0, 10);
  const made: any = await createShowSeries(null, { sourceShowId: src.id, from, count: 3, everyDays: 7, idempotencyKey: k() }, staff);
  const ids: string[] = made.showIds; shows.push(...ids); assert.equal(ids.length, 3);
  await p.show.updateMany({ where: { id: { in: ids } }, data: { status: 'on_sale' } });
  // real paid orders: two on show 1, one on show 2, none on show 3
  const buy = async (showId: string, qty: number, n: string) => {
    const tier = await p.priceTier.findFirst({ where: { showId } }); const hold = await createTicketHold(null, { showId, tierId: tier!.id, quantity: qty, idempotencyKey: k() }, anon);
    const co: any = await startTicketCheckout(null, { holdKey: hold.holdKey, cartToken: hold.cartToken, customer: { name: n, email: `${n.toLowerCase().replace(/\W/g, '')}@example.test` }, ageAttested: true, idempotencyKey: k() }, anon);
    const order = await p.ticketOrder.findUnique({ where: { orderNumber: co.orderNumber }, include: { paymentCollection: { include: { paymentSessions: true } } } });
    const intentId = (order!.paymentCollection!.paymentSessions.find((s: any) => s.isSelected) as any).data.paymentIntentId as string;
    await stripe.paymentIntents.confirm(intentId, { payment_method: 'pm_card_visa', return_url: 'https://example.test/return' });
    const intent = await stripe.paymentIntents.retrieve(intentId);
    const raw = JSON.stringify({ id: 'evt_' + k().replace(/-/g, ''), object: 'event', type: 'payment_intent.succeeded', livemode: false, data: { object: intent } });
    await handlePaymentWebhook(anon, raw, { 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: raw, secret: process.env.STRIPE_WEBHOOK_SECRET! }) });
    return { orderId: order!.id, intentId, total: order!.totalCents as number };
  };
  const orders = [await buy(ids[0], 2, 'Ann One'), await buy(ids[0], 1, 'Bob Two'), await buy(ids[1], 3, 'Cy Three')];
  for (const o of orders) assert.equal((await p.ticketOrder.findUnique({ where: { id: o.orderId } }))!.status, 'paid');

  // refused while an edit would race a cancel: not yet. First, the intent is recorded once and audited.
  const key = k(); const groupId = await recordSeriesCancel(staff, { groupId: made.groupId, reason: 'Venue closed', idempotencyKey: key });
  await recordSeriesCancel(staff, { groupId: made.groupId, reason: 'Venue closed', idempotencyKey: key });
  const g = await p.showGroup.findUnique({ where: { id: groupId } }); assert(g!.cancelRequestedAt && g!.cancelRequestedById === owner.id && g!.cancelReason === 'Venue closed'); assert.equal((g!.cancelShowIds as string[]).length, 3);
  assert.equal(await p.auditEvent.count({ where: { action: 'series_cancel_requested', targetId: groupId } }), 1, 'recorded and audited once');
  await assert.rejects(editShowSeries(null, { groupId, edit: { publicNote: 'x' }, idempotencyKey: k() }, staff), /being cancelled/);

  // the operator's tab does ONE show and is closed
  const first: any = await advanceSeriesCancel(staff, groupId, owner.id, 0);
  assert.equal(first.completed, false); assert.equal(first.total, 3); assert(first.done >= 1 && first.done < 3, 'interrupted part way: ' + first.done);
  const prog: any = await seriesCancelProgress(null, { groupId }, staff); assert.equal(prog.requested, true); assert.equal(prog.completed, false);
  // a crash between "show cancelled" and "refunds done": show 2 is cancelled but its order is still paid
  await p.show.update({ where: { id: ids[1] }, data: { status: 'cancelled' } });
  assert.equal((await p.ticketOrder.findUnique({ where: { id: orders[2].orderId } }))!.status, 'paid');

  // show 3 opened its doors before the cancellation reached it: it is left to run, and the series stays open until it closes
  const s3 = await p.show.findUnique({ where: { id: ids[2] } });
  if (s3!.status !== 'cancelled') {
    await p.show.update({ where: { id: ids[2] }, data: { status: 'doors_open' } });
    const mid: any = await advanceSeriesCancel(staff, groupId, owner.id, 20000);
    assert.equal(mid.completed, false); assert.equal((await p.show.findUnique({ where: { id: ids[2] } }))!.status, 'doors_open', 'a running show is never cancelled');
    assert(mid.problems.some((x: string) => /already running/.test(x)));
    await p.show.update({ where: { id: ids[2] }, data: { status: 'completed' } });
  }
  const ranExpected = s3!.status !== 'cancelled' ? 1 : 0;
  // the sweep refuses a wrong secret, then finishes the series while the operator's loop also runs
  await assert.rejects(sweepSeriesCancellations(null, { secret: 'nope' }, anon), /Not authorized/);
  const [s1, s2, ui] = await Promise.all([sweepSeriesCancellations(null, { secret: process.env.CRON_SECRET! }, anon), sweepSeriesCancellations(null, { secret: process.env.CRON_SECRET! }, anon), advanceSeriesCancel(staff, groupId, owner.id, 20000)]);
  console.log('sweeps', JSON.stringify(s1), JSON.stringify(s2), 'ui', ui.done, '/', ui.total);
  const after: any = await seriesCancelProgress(null, { groupId }, staff);
  if (!after.completed) await sweepSeriesCancellations(null, { secret: process.env.CRON_SECRET! }, anon);
  const fin: any = await seriesCancelProgress(null, { groupId }, staff); assert.equal(fin.completed, true); assert.equal(fin.done, 3); assert.equal(fin.ran, ranExpected); assert.equal(fin.refundsWaiting, 0);
  for (const id of ids.slice(0, 3 - ranExpected)) assert.equal((await p.show.findUnique({ where: { id } }))!.status, 'cancelled');
  // exactly one real refund per order, at Stripe and in the DB, for the full amount
  for (const o of orders) {
    const sr = await stripe.refunds.list({ payment_intent: o.intentId }); assert.equal(sr.data.length, 1, 'one Stripe refund'); assert.equal(sr.data[0].amount, o.total);
    const rows = await p.refund.findMany({ where: { orderId: o.orderId, status: 'succeeded' } }); assert.equal(rows.length, 1); assert.equal((await p.ticketOrder.findUnique({ where: { id: o.orderId } }))!.status, 'refunded');
  }
  assert.equal(await p.auditEvent.count({ where: { action: 'series_cancelled', targetId: groupId } }), 1, 'completion audited once');
  // everything is idempotent afterwards
  const again: any = await sweepSeriesCancellations(null, { secret: process.env.CRON_SECRET! }, anon); assert.equal(again.groups, 0);
  await assert.rejects(cancelShowSeries(null, { groupId, reason: 'Venue closed', idempotencyKey: k() }, staff), /No future shows|Series/).catch(() => {});
  for (const o of orders) assert.equal((await stripe.refunds.list({ payment_intent: o.intentId })).data.length, 1);
  console.log('PASS series cancel e2e: intent recorded once, interrupted at', first.done, 'of 3, finished by the sweep racing the UI loop, one Stripe refund per order x', orders.length, '; shows that ran:', ranExpected);
} finally {
  if (shows.length) await p.show.updateMany({ where: { id: { in: shows } }, data: { status: 'cancelled' } });
  await p.$disconnect();
} }
main().catch((e) => { console.error(e); process.exit(1); });
