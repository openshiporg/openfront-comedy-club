import crypto from 'node:crypto';
import { audit, code, command, hash, lockTransactionKey, prove, requirePermission } from '../lib/commands';
import { quote, selfRefundAllowed } from '../lib/money';
import { consumeManagerApproval } from '../utils/managerApproval';
import { createPayment, getPaymentStatus, refundPayment } from '../utils/paymentProviderAdapter';
import { assertCheckoutProviderObservation } from '../utils/checkoutProviderObservation';
import { nextPaymentStatus } from '../utils/paymentState';

const PROVIDER_CODE = 'pp_stripe';
export const ticketToken = (ticketCode: string) =>
  crypto.createHmac('sha256', process.env.SESSION_SECRET || '').update('ticket\0' + ticketCode).digest('hex');
const providerFor = async (context: any, codeValue = PROVIDER_CODE) => {
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: codeValue } });
  if (!provider?.isInstalled) throw new Error('Payment provider unavailable');
  return provider;
};

export async function startTicketCheckout(_: any, input: any, context: any) {
  const lookup = await context.prisma.inventoryHold.findUnique({ where: { holdKey: input.holdKey } });
  prove(lookup, input.cartToken);
  const customer = input.customer || {};
  const email = String(customer.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !String(customer.name || '').trim()) throw new Error('Name and email required');
  const secret = crypto.randomBytes(24).toString('hex');
  // Phase 1: freeze the quote and create the pending order under the show lock.
  const local = await command(context, 'startTicketCheckout', { ...input, cartToken: hash(input.cartToken) }, async tx => {
    const hold = await tx.inventoryHold.findUnique({ where: { id: lookup.id }, include: { show: { include: { room: { include: { venue: true } } } }, priceTier: true, tables: true, redemption: { include: { promoCode: true } } } });
    prove(hold, input.cartToken);
    if (hold.status !== 'active' || hold.expiresAt <= new Date() || hold.show.status !== 'on_sale') throw new Error('Hold expired');
    if (await tx.ticketOrder.count({ where: { hold: { id: hold.id } } })) throw new Error('Checkout already started');
    if (hold.show.ageRestriction !== 'all' && input.ageAttested !== true) throw new Error('Age confirmation required');
    const venue = hold.show.room.venue;
    const promo = hold.redemption?.status === 'reserved' ? hold.redemption.promoCode : null;
    const q = quote({ priceCents: hold.priceTier.priceCents, feeCents: hold.priceTier.feeCents, quantity: hold.quantity, serviceFeeBps: venue.serviceFeeBps, taxBps: venue.taxBps, discountType: promo?.discountType, discountValue: promo?.value });
    if (q.totalCents < 1) throw new Error('Payment is not required for this order; contact the venue');
    const order = await tx.ticketOrder.create({ data: {
      orderNumber: code('CC'), customerId: context.session?.itemId || null, email, name: String(customer.name).trim(), phone: String(customer.phone || ''),
      showId: hold.showId, status: 'pending_payment', ...q, currencyCode: 'USD', source: 'online', partySize: hold.quantity,
      seatingRequest: String(input.seatingRequest || '').slice(0, 500), birthdayOrOccasion: String(input.occasion || '').slice(0, 200), ageAttested: input.ageAttested === true,
      secretKey: hash(secret), holdId: undefined, hold: { connect: { id: hold.id } },
      lines: { create: [{ tierName: hold.priceTier.name, unitPriceCents: hold.priceTier.priceCents, unitFeeCents: hold.priceTier.feeCents, quantity: hold.quantity, lineTotalCents: q.subtotalCents, discountCents: q.discountCents, taxCents: q.taxCents, currencyCode: 'USD', priceTierId: hold.priceTierId }] },
    } });
    if (hold.redemption) await tx.promoRedemption.update({ where: { id: hold.redemption.id }, data: { orderId: order.id, amountCents: q.discountCents } });
    await audit(tx, context, 'checkout_started', 'TicketOrder', order.id, null, { totalCents: q.totalCents });
    return { orderId: order.id, orderNumber: order.orderNumber, totalCents: q.totalCents, currencyCode: 'USD', expiresAt: hold.expiresAt };
  }, 'show:' + lookup.showId);
  // Phase 2: provider call outside the transaction, keyed by the order.
  const provider = await providerFor(context);
  const attemptKey = hash('payment:' + local.orderId);
  let session = await context.prisma.paymentSession.findUnique({ where: { idempotencyKey: attemptKey } });
  if (!session) {
    const created = await createPayment({ provider, order: { id: local.orderId, orderNumber: local.orderNumber, currencyCode: 'USD' }, amount: local.totalCents, currency: 'USD', idempotencyKey: attemptKey });
    const collection = await context.prisma.paymentCollection.create({ data: { amount: local.totalCents, description: 'default', order: { connect: { id: local.orderId } } } });
    session = await context.prisma.paymentSession.create({ data: { idempotencyKey: attemptKey, amount: local.totalCents, isSelected: true, isInitiated: true, paymentCollection: { connect: { id: collection.id } }, paymentProvider: { connect: { id: provider.id } }, data: { paymentIntentId: created.paymentIntentId, clientSecret: created.clientSecret, state: 'ready' } } });
  }
  return { orderNumber: local.orderNumber, orderSecret: secret, totalCents: local.totalCents, currencyCode: 'USD', clientSecret: session.data?.clientSecret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY || '', expiresAt: local.expiresAt };
}

/** Converts the hold into paid tickets. Caller holds the show lock inside a transaction. */
export async function finalizePaidOrder(tx: any, context: any, orderId: string, provider: any, providerPaymentId: string) {
  const order = await tx.ticketOrder.findUnique({ where: { id: orderId }, include: { hold: { include: { redemption: true } }, lines: true, paymentCollection: true, show: true } });
  if (!order) throw new Error('Order not found');
  if (order.status === 'paid') return order;
  if (order.status !== 'pending_payment' || !order.hold || order.hold.status !== 'active') throw new Error('Order cannot be completed; operator reconciliation required');
  const line = order.lines[0];
  for (let i = 0; i < order.hold.quantity; i++) {
    const ticketCode = code('T');
    await tx.ticket.create({ data: { orderId: order.id, showId: order.showId, lineId: line.id, ticketCode, tokenHash: hash(ticketToken(ticketCode)), holderName: order.name, status: 'valid' } });
  }
  const tier = await tx.priceTier.update({ where: { id: order.hold.priceTierId }, data: { sold: { increment: order.hold.quantity }, held: { decrement: order.hold.quantity } } });
  await tx.inventoryHold.update({ where: { id: order.hold.id }, data: { status: 'converted' } });
  if (order.hold.redemption) {
    await tx.promoRedemption.update({ where: { id: order.hold.redemption.id }, data: { status: 'committed' } });
    await tx.promoCode.update({ where: { id: order.hold.redemption.promoCodeId }, data: { usedCount: { increment: 1 } } });
  }
  await tx.payment.create({ data: { idempotencyKey: 'pay:' + order.id, amount: order.totalCents, currencyCode: order.currencyCode, status: 'succeeded', paymentMethod: 'credit_card', providerPaymentId, processedAt: new Date(), orderId: order.id, paymentProviderId: provider.id, paymentCollectionId: order.paymentCollection?.id || null } });
  await tx.ticketOrder.update({ where: { id: order.id }, data: { status: 'paid' } });
  const totals = await tx.priceTier.aggregate({ where: { showId: order.showId }, _sum: { sold: true, held: true } });
  if (tier.sold >= tier.capacity) await tx.priceTier.update({ where: { id: tier.id }, data: { status: 'sold_out' } });
  if (order.show.status === 'on_sale' && (totals._sum.sold || 0) + (totals._sum.held || 0) >= order.show.capacity) await tx.show.update({ where: { id: order.showId }, data: { status: 'sold_out' } });
  await audit(tx, context, 'paid', 'TicketOrder', order.id, { status: 'pending_payment' }, { status: 'paid' });
  return order;
}

export async function verifyAndFinalize(context: any, order: any) {
  const session = order.paymentCollection?.paymentSessions?.find((s: any) => s.isSelected);
  const intent = session?.data?.paymentIntentId;
  if (!intent) throw new Error('Payment not started');
  const provider = await providerFor(context);
  let observed: any;
  try { observed = await getPaymentStatus({ provider, paymentId: intent }); }
  catch { return { status: 'unknown' }; } // never paid on an unreadable provider response
  if (['canceled', 'requires_payment_method'].includes(observed.status)) return { status: 'failed' };
  if (observed.status !== 'succeeded') return { status: 'pending' };
  assertCheckoutProviderObservation(observed, order.totalCents, order.currencyCode);
  await context.prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, 'show:' + order.showId);
    await finalizePaidOrder(tx, context, order.id, provider, intent);
  }, { timeout: 20000 });
  return { status: 'paid' };
}

const orderForProof = async (context: any, orderNumber: string, secret: string) => {
  const order = await context.prisma.ticketOrder.findUnique({ where: { orderNumber }, include: { paymentCollection: { include: { paymentSessions: true } } } });
  prove(order, secret, 'secretKey');
  return order;
};

export async function completeTicketCheckout(_: any, input: any, context: any) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  if (order.status === 'paid') return { status: 'paid', orderNumber: order.orderNumber };
  if (order.status !== 'pending_payment') return { status: order.status, orderNumber: order.orderNumber };
  const result = await verifyAndFinalize(context, order);
  return { ...result, orderNumber: order.orderNumber };
}

/** Releases a pending order only after the provider confirms the payment cannot succeed. */
async function abandonPending(context: any, order: any) {
  const intent = order.paymentCollection?.paymentSessions?.[0]?.data?.paymentIntentId;
  const provider = await providerFor(context);
  const observed = intent ? await getPaymentStatus({ provider, paymentId: intent }) : { status: 'canceled' };
  if (observed.status === 'succeeded') { await verifyAndFinalize(context, order); return 'paid'; }
  if (!['canceled', 'requires_payment_method'].includes(observed.status)) return 'pending';
  await context.prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, 'show:' + order.showId);
    const fresh = await tx.ticketOrder.updateMany({ where: { id: order.id, status: 'pending_payment' }, data: { status: 'cancelled' } });
    if (fresh.count !== 1) return;
    const hold = await tx.inventoryHold.findFirst({ where: { order: { id: order.id }, status: 'active' }, include: { redemption: true } });
    if (hold) {
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'released' } });
      await tx.priceTier.update({ where: { id: hold.priceTierId }, data: { held: { decrement: hold.quantity } } });
      await tx.tableOccupancy.updateMany({ where: { holdId: hold.id }, data: { occupancyKey: null } });
      if (hold.redemption) await tx.promoRedemption.update({ where: { id: hold.redemption.id }, data: { status: 'released' } });
    }
    await audit(tx, context, 'cancelled', 'TicketOrder', order.id, { status: 'pending_payment' }, { status: 'cancelled' }, 'payment did not complete');
  });
  return 'cancelled';
}

export async function abandonTicketCheckout(_: any, input: any, context: any) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  if (order.status !== 'pending_payment') return { status: order.status };
  return { status: await abandonPending(context, order) };
}

/** Cron entry point: settles pending orders whose hold window has passed. Never trusts a timeout as failure. */
export async function sweepPendingCheckouts(_: any, { secret }: { secret: string }, context: any) {
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) throw new Error('Not authorized');
  const orders = await context.prisma.ticketOrder.findMany({ where: { status: 'pending_payment', hold: { expiresAt: { lt: new Date(Date.now() - 5 * 60000) } } }, include: { paymentCollection: { include: { paymentSessions: true } } }, take: 50 });
  const out: Record<string, number> = {};
  for (const order of orders) { try { const r = await abandonPending(context, order); out[r] = (out[r] || 0) + 1; } catch { out.error = (out.error || 0) + 1; } }
  return out;
}

export async function ticketOrderConfirmation(_: any, input: any, context: any) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  const full = await context.prisma.ticketOrder.findUnique({ where: { id: order.id }, select: { orderNumber: true, status: true, name: true, totalCents: true, subtotalCents: true, feesCents: true, taxCents: true, discountCents: true, currencyCode: true, partySize: true, show: { select: { title: true, startsAt: true, doorsAt: true, ageRestriction: true, room: { select: { name: true } } } }, lines: { select: { tierName: true, quantity: true, unitPriceCents: true, lineTotalCents: true } }, tickets: { select: { ticketCode: true, status: true, holderName: true } } } });
  return { ...full, tickets: full.tickets.map((t: any) => ({ ...t, token: ticketToken(t.ticketCode) })) };
}

/** Local reservation first, provider refund outside the transaction, then finalization. */
export async function refundOrderInternal(context: any, a: { orderId: string; amountCents?: number; ticketIds?: string[]; reason: string; idempotencyKey: string; approvalId?: string; actorId: string | null; threshold: number }) {
  const prisma = context.prisma;
  const reserved = await command(context, 'refundTicketOrder', { ...a }, async tx => {
    const order = await tx.ticketOrder.findUnique({ where: { id: a.orderId }, include: { payments: true, tickets: true } });
    if (!order || !['paid', 'partially_refunded'].includes(order.status)) throw new Error('Order is not refundable');
    const payment = order.payments.find((p: any) => ['succeeded', 'partially_refunded'].includes(p.status));
    if (!payment) throw new Error('No captured payment');
    const tickets = (a.ticketIds?.length ? order.tickets.filter((t: any) => a.ticketIds!.includes(t.id)) : order.tickets.filter((t: any) => t.status === 'valid'));
    if (!tickets.length || tickets.some((t: any) => t.status !== 'valid')) throw new Error('Only valid tickets can be refunded');
    const remaining = payment.amount - payment.refundedAmount;
    const full = tickets.length === order.tickets.filter((t: any) => t.status === 'valid').length;
    const amount = a.amountCents ?? (full ? remaining : Math.floor(order.totalCents * tickets.length / order.tickets.length));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > remaining) throw new Error('Invalid refund amount');
    if (a.actorId && amount > a.threshold) await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: a.actorId, actionType: 'refund_payment', targetId: order.id, reason: a.reason, amount, entityType: 'TicketOrder', entityId: order.id });
    const refund = await tx.refund.create({ data: { idempotencyKey: 'refund:' + a.idempotencyKey, amount, currencyCode: payment.currencyCode, status: 'processing', reason: a.reason, paymentId: payment.id, orderId: order.id, requestedById: a.actorId } });
    return { refundId: refund.id, paymentId: payment.id, providerPaymentId: payment.providerPaymentId, providerId: payment.paymentProviderId, amount, currencyCode: payment.currencyCode, ticketIds: tickets.map((t: any) => t.id), showId: order.showId };
  }, undefined);
  const provider = await prisma.paymentProvider.findUnique({ where: { id: reserved.providerId } });
  let result: any; let finalStatus = 'unknown';
  try {
    result = await refundPayment({ provider, paymentId: reserved.providerPaymentId, amount: reserved.amount, currency: reserved.currencyCode, idempotencyKey: 'refund:' + a.idempotencyKey });
    finalStatus = result.status === 'succeeded' ? 'succeeded' : ['failed', 'canceled'].includes(result.status) ? 'failed' : 'unknown';
  } catch { finalStatus = 'unknown'; }
  await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, 'show:' + reserved.showId);
    const moved = await tx.refund.updateMany({ where: { id: reserved.refundId, status: { in: ['processing', 'unknown'] } }, data: { status: finalStatus, providerRefundId: result?.refundId || null, processedAt: finalStatus === 'succeeded' ? new Date() : null } });
    if (moved.count !== 1 || finalStatus !== 'succeeded') return;
    const payment = await tx.payment.update({ where: { id: reserved.paymentId }, data: { refundedAmount: { increment: reserved.amount } } });
    const fullyRefunded = payment.refundedAmount >= payment.amount;
    await tx.payment.update({ where: { id: payment.id }, data: { status: nextPaymentStatus('succeeded', fullyRefunded ? 'refunded' : 'partially_refunded') === 'succeeded' ? (fullyRefunded ? 'refunded' : 'partially_refunded') : 'refunded' } });
    const voided = await tx.ticket.findMany({ where: { id: { in: reserved.ticketIds }, status: 'valid' }, include: { line: true } });
    await tx.ticket.updateMany({ where: { id: { in: voided.map((t: any) => t.id) } }, data: { status: 'refunded' } });
    const byTier = new Map<string, number>(); for (const t of voided) byTier.set(t.line.priceTierId, (byTier.get(t.line.priceTierId) || 0) + 1);
    for (const [tierId, n] of byTier) await tx.priceTier.update({ where: { id: tierId }, data: { sold: { decrement: n }, status: 'on_sale' } });
    const remainingValid = await tx.ticket.count({ where: { orderId: a.orderId, status: { in: ['valid', 'checked_in'] } } });
    await tx.ticketOrder.update({ where: { id: a.orderId }, data: { status: remainingValid ? 'partially_refunded' : 'refunded' } });
    await tx.show.updateMany({ where: { id: reserved.showId, status: 'sold_out' }, data: { status: 'on_sale' } });
    await audit(tx, { session: { itemId: a.actorId } }, 'refunded', 'TicketOrder', a.orderId, null, { amount: reserved.amount, tickets: voided.length }, a.reason);
  }, { timeout: 20000 });
  return { refundId: reserved.refundId, status: finalStatus, amountCents: reserved.amount };
}

export async function refundTicketOrder(_: any, a: any, context: any) {
  requirePermission(context, 'canIssueRefunds');
  const settings = await context.prisma.venueSettings.findFirst();
  return refundOrderInternal(context, { orderId: a.orderId, amountCents: a.amountCents, ticketIds: a.ticketIds, reason: String(a.reason || '').trim() || (() => { throw new Error('Reason required'); })(), idempotencyKey: a.idempotencyKey, approvalId: a.approvalId, actorId: context.session.itemId, threshold: settings?.approvalThresholdCents ?? 10000 });
}

export async function cancelMyTicketOrder(_: any, a: any, context: any) {
  const order = await context.prisma.ticketOrder.findUnique({ where: { orderNumber: a.orderNumber }, include: { show: true } });
  if (!order || order.email.toLowerCase() !== String(a.email).trim().toLowerCase()) throw new Error('Order not found');
  const settings = await context.prisma.venueSettings.findFirst();
  if (!selfRefundAllowed(order.show.startsAt, settings?.refundWindowHours ?? 24)) throw new Error('The self-cancel window has closed; contact the venue');
  return refundOrderInternal(context, { orderId: order.id, reason: 'Customer cancelled within window', idempotencyKey: a.idempotencyKey, actorId: null, threshold: Number.MAX_SAFE_INTEGER });
}
