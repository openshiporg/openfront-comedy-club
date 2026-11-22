import { offerFreedSeats } from './waitlistCore';
import crypto from 'node:crypto';
import { audit, code, command, hash, lockTransactionKey, prove, requirePermission } from '../lib/commands';
import { selfRefundAllowed } from '../lib/money';
import { quoteGroup, refundShare, ticketWeight } from '../lib/groupHold';
import { releaseHoldSeats } from '../lib/holds';
import { consumeManagerApproval } from '../utils/managerApproval';
import { cancelPayment, createPayment, getPaymentStatus, refundPayment } from '../utils/paymentProviderAdapter';
import { assertCheckoutProviderObservation } from '../utils/checkoutProviderObservation';
import { nextPaymentStatus, refundOutcome } from '../utils/paymentState';
import { sendTicketEmail } from '../lib/ticketEmail';

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
    const hold = await tx.inventoryHold.findUnique({ where: { id: lookup.id }, include: { show: { include: { room: { include: { venue: true } } } }, lines: { include: { priceTier: true } }, priceTier: true, tables: true, redemption: { include: { promoCode: true } } } });
    prove(hold, input.cartToken);
    if (hold.status !== 'active' || hold.expiresAt <= new Date() || hold.show.status !== 'on_sale') throw new Error('Hold expired');
    // Reload, back button or a failed payment step: the holder of this hold's cart token picks the same pending order back up.
    const started = await tx.ticketOrder.findFirst({ where: { hold: { id: hold.id } } });
    if (started) {
      if (started.status !== 'pending_payment') throw new Error('Checkout already started');
      await tx.ticketOrder.update({ where: { id: started.id }, data: { secretKey: hash(secret) } });
      return { orderId: started.id, orderNumber: started.orderNumber, totalCents: started.totalCents, currencyCode: 'USD', expiresAt: hold.expiresAt };
    }
    if (hold.show.ageRestriction !== 'all' && input.ageAttested !== true) throw new Error('Age confirmation required');
    const venue = hold.show.room.venue;
    const promo = hold.redemption?.status === 'reserved' ? hold.redemption.promoCode : null;
    // a hold made before party holds existed has no lines: price it from the hold itself
    const hl: { tier: any; quantity: number }[] = hold.lines.length ? hold.lines.map((l: any) => ({ tier: l.priceTier, quantity: l.quantity })) : [{ tier: hold.priceTier, quantity: hold.quantity }];
    const priced = hl.map((l) => ({ priceCents: l.tier.priceCents, feeCents: l.tier.feeCents, quantity: l.quantity }));
    const q = quoteGroup(priced, venue.serviceFeeBps, venue.taxBps, promo ? { discountType: promo.discountType, discountValue: promo.value, perOrderLimit: promo.perOrderLimit } : null);
    const parts = q.lines;
    if (q.totalCents < 1) throw new Error('Payment is not required for this order; contact the venue');
    const order = await tx.ticketOrder.create({ data: {
      orderNumber: code('CC'), customerId: context.session?.itemId || null, email, name: String(customer.name).trim(), phone: String(customer.phone || ''),
      showId: hold.showId, status: 'pending_payment', ...q, currencyCode: 'USD', source: 'online', partySize: hold.quantity,
      seatingRequest: String(input.seatingRequest || '').slice(0, 500), birthdayOrOccasion: String(input.occasion || '').slice(0, 200), ageAttested: input.ageAttested === true,
      secretKey: hash(secret), holdId: undefined, hold: { connect: { id: hold.id } },
      lines: { create: hl.map((l, i) => ({ tierName: l.tier.name, unitPriceCents: l.tier.priceCents, unitFeeCents: l.tier.feeCents, quantity: l.quantity, lineTotalCents: parts[i].subtotalCents, discountCents: parts[i].discountCents, taxCents: parts[i].taxCents, currencyCode: 'USD', priceTierId: l.tier.id })) },
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
export async function finalizePaidOrder(tx: any, context: any, orderId: string, provider: any, providerPaymentId: string, card: CardParts = {}) {
  const order = await tx.ticketOrder.findUnique({ where: { id: orderId }, include: { hold: { include: { redemption: true } }, lines: true, paymentCollection: true, show: true } });
  if (!order) throw new Error('Order not found');
  if (order.status === 'paid') return order;
  if (order.status !== 'pending_payment' || !order.hold || order.hold.status !== 'active') throw new Error('Order cannot be completed; operator reconciliation required');
  // convert every line of the hold: tickets per ticket type, and each tier moves its seats from held to sold
  const soldTiers: any[] = [];
  for (const line of order.lines) {
    for (let i = 0; i < line.quantity; i++) {
      const ticketCode = code('T');
      await tx.ticket.create({ data: { orderId: order.id, showId: order.showId, lineId: line.id, ticketCode, tokenHash: hash(ticketToken(ticketCode)), holderName: order.name, status: 'valid' } });
    }
    soldTiers.push(await tx.priceTier.update({ where: { id: line.priceTierId }, data: { sold: { increment: line.quantity }, held: { decrement: line.quantity } } }));
  }
  await tx.inventoryHold.update({ where: { id: order.hold.id }, data: { status: 'converted' } });
  if (order.hold.redemption) {
    await tx.promoRedemption.update({ where: { id: order.hold.redemption.id }, data: { status: 'committed' } });
    await tx.promoCode.update({ where: { id: order.hold.redemption.promoCodeId }, data: { usedCount: { increment: 1 } } });
  }
  await tx.payment.create({ data: { idempotencyKey: 'pay:' + order.id, amount: order.totalCents, currencyCode: order.currencyCode, status: 'succeeded', paymentMethod: 'credit_card', cardBrand: card.brand || '', cardLast4: card.last4 || '', providerPaymentId, processedAt: new Date(), orderId: order.id, paymentProviderId: provider.id, paymentCollectionId: order.paymentCollection?.id || null } });
  await tx.ticketOrder.update({ where: { id: order.id }, data: { status: 'paid' } });
  const totals = await tx.priceTier.aggregate({ where: { showId: order.showId }, _sum: { sold: true, held: true } });
  for (const tier of soldTiers) if (tier.sold >= tier.capacity) await tx.priceTier.updateMany({ where: { id: tier.id, status: 'on_sale' }, data: { status: 'sold_out' } });
  if (order.show.status === 'on_sale' && (totals._sum.sold || 0) + (totals._sum.held || 0) >= order.show.capacity) await tx.show.update({ where: { id: order.showId }, data: { status: 'sold_out' } });
  await audit(tx, context, 'paid', 'TicketOrder', order.id, { status: 'pending_payment' }, { status: 'paid' });
  return order;
}

/** Card brand and last four from the observed payment; empty when the provider does not say. */
type CardParts = { brand?: string; last4?: string };
type Observed = { data?: { latest_charge?: string | { payment_method_details?: { card?: { brand?: string; last4?: string } } } | null } };
async function cardOf(provider: { code?: string } | null, observed: Observed): Promise<CardParts> {
  try {
    const intent = observed?.data;
    const ch = intent?.latest_charge;
    const details = (typeof ch === 'object' ? ch?.payment_method_details?.card : null) || null;
    if (details) return { brand: details.brand, last4: details.last4 };
    if (typeof ch === 'string' && provider?.code === 'pp_stripe') {
      const { default: Stripe } = await import('stripe');
      const charge = await new Stripe(String(process.env.STRIPE_SECRET_KEY)).charges.retrieve(ch);
      const d = charge.payment_method_details?.card;
      return { brand: d?.brand || undefined, last4: d?.last4 || undefined };
    }
  } catch { /* the payment is still recorded without card details */ }
  return {};
}

/** Emails the buyer their tickets and records the outcome (message id or error) in the audit log. Never throws: the order is paid either way. */
export async function emailTickets(context: any, orderId: string) {
  try {
    const o = await context.prisma.ticketOrder.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, email: true, name: true, currencyCode: true, totalCents: true, feesCents: true, taxCents: true, discountCents: true, lines: { select: { tierName: true, quantity: true, lineTotalCents: true } }, tickets: { where: { status: 'valid' }, orderBy: { createdAt: 'asc' }, select: { ticketCode: true } }, show: { select: { title: true, startsAt: true, doorsAt: true, room: { select: { name: true, venue: { select: { name: true, address: true, timezone: true, drinkMinimumItems: true } } } } } } } });
    if (!o?.tickets.length) return { sent: false, error: 'no_tickets' };
    const result = await sendTicketEmail({ ...o, venue: o.show.room?.venue || { name: 'The club' } }, o.tickets.map((t: any) => ({ ticketCode: t.ticketCode, token: ticketToken(t.ticketCode) })));
    await audit(context.prisma, context, result.sent ? 'tickets_emailed' : 'tickets_email_failed', 'TicketOrder', o.id, null, { to: o.email, tickets: o.tickets.length, ...result });
    return result;
  } catch (error) {
    console.error('Ticket email step failed:', error instanceof Error ? error.message.slice(0, 200) : 'unknown');
    return { sent: false, error: 'failed' };
  }
}

/** Box office: send the tickets again, e.g. when the buyer says the first email did not arrive. */
export async function emailTicketOrder(_: any, a: any, context: any) {
  requirePermission(context, 'canManageOrders');
  const order = await context.prisma.ticketOrder.findUnique({ where: { id: String(a.orderId || '') }, select: { id: true, status: true } });
  if (!order) throw new Error('Order not found');
  if (!['paid', 'partially_refunded', 'comp'].includes(order.status)) throw new Error('Only a paid order has tickets to send');
  const r = await emailTickets(context, order.id);
  if (!r.sent) throw new Error('The email could not be sent; try again');
  return r;
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
  const card = await cardOf(provider, observed);
  // Under the show lock only one caller (return page or webhook) sees the order still pending; that one sends the tickets.
  const before = await context.prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, 'show:' + order.showId);
    return finalizePaidOrder(tx, context, order.id, provider, intent, card);
  }, { timeout: 20000 });
  if (before?.status === 'pending_payment') await emailTickets(context, order.id);
  // The card was charged after the show was cancelled: cancelShow already ran its refund pass, so refund this one now.
  const showNow = await context.prisma.show.findUnique({ where: { id: order.showId }, select: { status: true } });
  if (showNow?.status === 'cancelled') {
    try { await refundOrderInternal(context, { orderId: order.id, reason: 'Show cancelled', idempotencyKey: `cancel:${order.showId}:${order.id}`, actorId: null, threshold: Number.MAX_SAFE_INTEGER, includeCheckedIn: true }); } catch { /* stays paid on a cancelled show; the cancel retry refunds it */ }
  }
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
  // A declined payment can still be paid with another card; cancel it at Stripe first so no charge can land after the seats go.
  if (intent && observed.status !== 'canceled') {
    const r = await cancelPayment({ provider, paymentId: intent, idempotencyKey: hash('checkout-cancel:' + order.id) });
    if (r.status === 'succeeded') { await verifyAndFinalize(context, order); return 'paid'; }
    if (r.status !== 'cancelled') return 'pending';
  }
  await context.prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, 'show:' + order.showId);
    const fresh = await tx.ticketOrder.updateMany({ where: { id: order.id, status: 'pending_payment' }, data: { status: 'cancelled' } });
    if (fresh.count !== 1) return;
    const hold = await tx.inventoryHold.findFirst({ where: { order: { id: order.id }, status: 'active' }, include: { redemption: true } });
    if (hold) {
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { status: 'released' } });
      await releaseHoldSeats(tx, hold);
      await tx.tableOccupancy.updateMany({ where: { holdId: hold.id }, data: { occupancyKey: null } });
      if (hold.redemption) await tx.promoRedemption.update({ where: { id: hold.redemption.id }, data: { status: 'released' } });
    }
    await offerFreedSeats(tx, context, order.showId);
    await audit(tx, context, 'cancelled', 'TicketOrder', order.id, { status: 'pending_payment' }, { status: 'cancelled' }, 'payment did not complete');
  });
  return 'cancelled';
}

export async function abandonTicketCheckout(_: any, input: any, context: any) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  if (order.status !== 'pending_payment') return { status: order.status };
  return { status: await abandonPending(context, order) };
}

/** Request-driven, idempotent: settles pending orders whose hold window passed 5+ minutes ago. Never trusts a timeout as failure; the provider decides. Called from the hold-expiry read path. */
export async function settleStalePendingCheckouts(context: any, showId?: string) {
  const orders = await context.prisma.ticketOrder.findMany({ where: { status: 'pending_payment', ...(showId ? { showId } : {}), hold: { expiresAt: { lt: new Date(Date.now() - 5 * 60000) } } }, include: { paymentCollection: { include: { paymentSessions: true } } }, take: 5 });
  for (const order of orders) { try { await abandonPending(context, order); } catch { /* the next read retries */ } }
  return orders.length;
}

export async function ticketOrderConfirmation(_: any, input: any, context: any) {
  const order = await orderForProof(context, input.orderNumber, input.orderSecret);
  const full = await context.prisma.ticketOrder.findUnique({ where: { id: order.id }, select: { orderNumber: true, status: true, name: true, totalCents: true, subtotalCents: true, feesCents: true, taxCents: true, discountCents: true, currencyCode: true, partySize: true, show: { select: { title: true, startsAt: true, doorsAt: true, ageRestriction: true, room: { select: { name: true } } } }, lines: { select: { tierName: true, quantity: true, unitPriceCents: true, lineTotalCents: true } }, tickets: { orderBy: { createdAt: "asc" }, select: { ticketCode: true, status: true, holderName: true, transferredFromCode: true } } } });
  return { ...full, tickets: full.tickets.map((t: any) => ({ ...t, token: ticketToken(t.ticketCode) })) };
}

/** Local reservation first, provider refund outside the transaction, then finalization. */
export async function refundOrderInternal(context: any, a: { orderId: string; amountCents?: number; ticketIds?: string[]; reason: string; idempotencyKey: string; approvalId?: string; actorId: string | null; threshold: number; includeCheckedIn?: boolean; retry?: boolean; reserved?: any }) {
  // A cancelled show owes every ticket back, scanned or not; a normal refund only takes tickets that are still valid.
  const live = a.includeCheckedIn ? ['valid', 'checked_in'] : ['valid'];
  const prisma = context.prisma;
  const reserved = a.reserved ?? await command(context, 'refundTicketOrder', { ...a }, async tx => {
    const order = await tx.ticketOrder.findUnique({ where: { id: a.orderId }, include: { payments: true, tickets: { include: { line: true } } } });
    if (!order || !['paid', 'partially_refunded'].includes(order.status)) throw new Error('Order is not refundable');
    // An earlier refund that is still processing or unknown has not moved money locally yet; a second one would count the same seats and dollars twice.
    if (await tx.refund.count({ where: { orderId: order.id, status: { in: ['processing', 'unknown'] } } })) throw new Error('A refund on this order is still being confirmed. Wait for it or retry that refund first');
    const payment = order.payments.find((p: any) => ['succeeded', 'partially_refunded'].includes(p.status));
    if (!payment) throw new Error('No captured payment');
    const tickets = (a.ticketIds?.length ? order.tickets.filter((t: any) => a.ticketIds!.includes(t.id)) : order.tickets.filter((t: any) => live.includes(t.status)));
    if (!tickets.length || tickets.some((t: any) => !live.includes(t.status))) throw new Error('Only valid tickets can be refunded');
    const remaining = payment.amount - payment.refundedAmount;
    const full = tickets.length === order.tickets.filter((t: any) => live.includes(t.status)).length;
    // tickets replaced by a transfer are not part of the party any more; each remaining ticket weighs its own line price
    const kept = order.tickets.filter((t: any) => !order.tickets.some((x: any) => x.transferredFromCode === t.ticketCode));
    const price = (t: any) => ({ priceCents: ticketWeight(t.line) });
    const amount = a.amountCents ?? (full ? remaining : refundShare(order.totalCents, tickets.map(price), kept.map(price)));
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > remaining) throw new Error('Invalid refund amount');
    if (a.actorId && amount > a.threshold) await consumeManagerApproval(tx, { approvalId: a.approvalId, actorId: a.actorId, actionType: 'refund_payment', targetId: order.id, reason: a.reason, amount, entityType: 'TicketOrder', entityId: order.id });
    const refund = await tx.refund.create({ data: { idempotencyKey: 'refund:' + a.idempotencyKey, amount, currencyCode: payment.currencyCode, status: 'processing', reason: a.reason, paymentId: payment.id, orderId: order.id, requestedById: a.actorId } });
    return { refundId: refund.id, paymentId: payment.id, providerPaymentId: payment.providerPaymentId, providerId: payment.paymentProviderId, amount, currencyCode: payment.currencyCode, ticketIds: tickets.map((t: any) => t.id), showId: order.showId };
  }, 'order:' + a.orderId);
  const provider = await prisma.paymentProvider.findUnique({ where: { id: reserved.providerId } });
  let result: any; let finalStatus = 'unknown';
  try {
    // A retry looks for the refund at Stripe first, so a refund that already went out is never sent a second time.
    const sent = a.retry ? ((await getPaymentStatus({ provider, paymentId: reserved.providerPaymentId })).refunds || []).find((r: any) => r.metadata?.restaurantRefundKey === 'refund:' + a.idempotencyKey) : null;
    result = sent ? { refundId: sent.id, status: sent.status } : await refundPayment({ provider, paymentId: reserved.providerPaymentId, amount: reserved.amount, currency: reserved.currencyCode, idempotencyKey: 'refund:' + a.idempotencyKey });
    finalStatus = refundOutcome(result.status);
  } catch { finalStatus = 'unknown'; }
  await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, 'show:' + reserved.showId);
    const moved = await tx.refund.updateMany({ where: { id: reserved.refundId, status: { in: ['processing', 'unknown'] } }, data: { status: finalStatus, providerRefundId: result?.refundId || result?.id || '', processedAt: finalStatus === 'succeeded' ? new Date() : null } });
    if (moved.count !== 1 || finalStatus !== 'succeeded') return;
    const payment = await tx.payment.update({ where: { id: reserved.paymentId }, data: { refundedAmount: { increment: reserved.amount } } });
    const fullyRefunded = payment.refundedAmount >= payment.amount;
    await tx.payment.update({ where: { id: payment.id }, data: { status: nextPaymentStatus('succeeded', fullyRefunded ? 'refunded' : 'partially_refunded') === 'succeeded' ? (fullyRefunded ? 'refunded' : 'partially_refunded') : 'refunded' } });
    const voided = await tx.ticket.findMany({ where: { id: { in: reserved.ticketIds }, status: { in: live } }, include: { line: true } });
    await tx.ticket.updateMany({ where: { id: { in: voided.map((t: any) => t.id) } }, data: { status: 'refunded' } });
    const byTier = new Map<string, number>(); for (const t of voided) byTier.set(t.line.priceTierId, (byTier.get(t.line.priceTierId) || 0) + 1);
    for (const [tierId, n] of byTier) {
      await tx.priceTier.update({ where: { id: tierId }, data: { sold: { decrement: n } } });
      // Only a tier that sold out comes back; a paused or closed tier (or a cancelled show's) stays as the operator left it.
      await tx.priceTier.updateMany({ where: { id: tierId, status: 'sold_out' }, data: { status: 'on_sale' } });
    }
    const remainingValid = await tx.ticket.count({ where: { orderId: a.orderId, status: { in: ['valid', 'checked_in'] } } });
    await tx.ticketOrder.update({ where: { id: a.orderId }, data: { status: remainingValid ? 'partially_refunded' : 'refunded' } });
    // A fully refunded party gives its table back; a party already seated frees it when its check closes or it is unseated.
    if (!remainingValid) {
      const hold = await tx.inventoryHold.findFirst({ where: { order: { id: a.orderId } }, select: { id: true } });
      if (hold) await tx.tableOccupancy.updateMany({ where: { holdId: hold.id, assignmentId: null }, data: { occupancyKey: null } });
    }
    await tx.show.updateMany({ where: { id: reserved.showId, status: 'sold_out' }, data: { status: 'on_sale' } });
    await audit(tx, { session: { itemId: a.actorId } }, 'refunded', 'TicketOrder', a.orderId, null, { amount: reserved.amount, tickets: voided.length }, a.reason);
    await offerFreedSeats(tx, { session: { itemId: a.actorId } }, reserved.showId);
  }, { timeout: 20000 });
  return { refundId: reserved.refundId, status: finalStatus, amountCents: reserved.amount };
}

export async function refundTicketOrder(_: any, a: any, context: any) {
  requirePermission(context, 'canIssueRefunds');
  const settings = await context.prisma.venueSettings.findFirst();
  return refundOrderInternal(context, { orderId: a.orderId, amountCents: a.amountCents, ticketIds: a.ticketIds, reason: String(a.reason || '').trim() || (() => { throw new Error('Reason required'); })(), idempotencyKey: a.idempotencyKey, approvalId: a.approvalId, actorId: context.session.itemId, threshold: settings?.approvalThresholdCents ?? 10000 });
}

/** Staff retry of a refund left processing or unknown: same idempotency key and inputs as the first try. */
export async function retryTicketRefund(_: any, a: any, context: any) {
  requirePermission(context, 'canIssueRefunds');
  const refund = await context.prisma.refund.findUnique({ where: { id: String(a.refundId || '') } });
  if (!refund || !['processing', 'unknown'].includes(refund.status)) throw new Error('Only a refund that is still being confirmed can be retried');
  const key = refund.idempotencyKey.replace(/^refund:/, '');
  const attempt = await context.prisma.idempotencyKey.findUnique({ where: { idempotencyKey: key } });
  const p: any = attempt?.requestParams; const reserved: any = attempt?.responseBody;
  if (!p || attempt.requestPath !== 'refundTicketOrder' || attempt.recoveryPoint !== 'completed' || reserved?.refundId !== refund.id) throw new Error('The original refund request was not found');
  return refundOrderInternal(context, { orderId: refund.orderId, reason: refund.reason, idempotencyKey: key, actorId: p.actorId ?? null, threshold: 0, includeCheckedIn: p.includeCheckedIn === true, retry: true, reserved });
}

export async function cancelMyTicketOrder(_: any, a: any, context: any) {
  const order = await context.prisma.ticketOrder.findUnique({ where: { orderNumber: a.orderNumber }, include: { show: true } });
  if (!order || order.email.toLowerCase() !== String(a.email).trim().toLowerCase()) throw new Error('Order not found');
  const settings = await context.prisma.venueSettings.findFirst();
  if (!selfRefundAllowed(order.show.startsAt, settings?.refundWindowHours ?? 24)) throw new Error('The self-cancel window has closed; contact the venue');
  return refundOrderInternal(context, { orderId: order.id, reason: 'Customer cancelled within window', idempotencyKey: a.idempotencyKey, actorId: null, threshold: Number.MAX_SAFE_INTEGER });
}
