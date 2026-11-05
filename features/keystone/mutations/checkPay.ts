import { audit, command, hash, lockTransactionKey, requirePermission } from '../lib/commands';
import { checkBill } from '../lib/money';
import { cancelPayment, createPayment, getPaymentStatus } from '../utils/paymentProviderAdapter';
import { assertCheckoutProviderObservation } from '../utils/checkoutProviderObservation';

/**
 * Card tender on a bar/food check (keyed card, like a Toast virtual terminal). Stripe TEST only.
 * 1. startCheckCardPayment freezes the bill (check -> presented, no more items), records one pending Payment and creates the
 *    PaymentIntent outside the transaction, keyed by that payment.
 * 2. The operator enters the card in the Stripe Payment Element; completeCheckCardPayment re-reads Stripe and only then marks the
 *    payment succeeded and the check paid (tables freed). The signed webhook settles the same way if the screen is closed.
 * 3. cancelCheckCardPayment cancels the intent at Stripe and reopens the check. A succeeded intent is never cancelled.
 */
const PROVIDER = 'pp_stripe';
const LIVE_PAY = ['pending', 'processing', 'authorized', 'unknown'];

async function stripeProvider(context: any) {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Card payments need Stripe TEST keys');
  const provider = await context.prisma.paymentProvider.findUnique({ where: { code: PROVIDER } });
  if (!provider?.isInstalled) throw new Error('Card payments are not set up');
  return provider;
}

export async function startCheckCardPayment(_: any, a: any, c: any) {
  requirePermission(c, 'canManageChecks');
  const provider = await stripeProvider(c);
  const tipCents = a.tipCents == null ? 0 : a.tipCents;
  if (!Number.isSafeInteger(tipCents) || tipCents < 0 || tipCents > 1_000_000) throw new Error('Tip must be zero or more');
  const local = await command(c, 'startCheckCardPayment', a, async tx => {
    const check = await tx.check.findUnique({ where: { id: String(a.checkId || '') }, include: { items: true } });
    if (!check) throw new Error('Check not found');
    const live = await tx.payment.findFirst({ where: { checkId: check.id, status: { in: LIVE_PAY } } });
    if (live) return { paymentId: live.id, amount: live.amount, resumed: true };
    if (check.status !== 'open') throw new Error('Check cannot take a card payment');
    if (await tx.payment.count({ where: { checkId: check.id, status: 'succeeded' } })) throw new Error('Check already paid');
    const bill = checkBill({ items: check.items, requiredItems: check.minimumItemsRequired, cheapestCents: check.minimumUnitPriceCents, floorCents: check.minimumCentsFloor, taxBps: check.taxBps, tipCents });
    if (bill.totalCents < 50) throw new Error('Card payments start at $0.50; close the check instead');
    const changed = await tx.check.updateMany({ where: { id: check.id, status: 'open' }, data: { status: 'presented', ...bill } });
    if (changed.count !== 1) throw new Error('Check changed');
    const attempts = await tx.payment.count({ where: { checkId: check.id } });
    const payment = await tx.payment.create({ data: { idempotencyKey: `checkpay:${check.id}:${attempts + 1}`, amount: bill.totalCents, tipAmount: bill.tipCents, currencyCode: check.currencyCode || 'USD', status: 'pending', paymentMethod: 'credit_card', checkId: check.id, paymentProviderId: provider.id, processedById: c.session.itemId } });
    await audit(tx, c, 'card_started', 'Check', check.id, { status: 'open' }, { status: 'presented', ...bill, paymentId: payment.id });
    return { paymentId: payment.id, amount: payment.amount, resumed: false };
  }, 'check:' + a.checkId);
  // provider call outside the transaction, keyed by the payment so a retry reuses the same intent
  const payment = await c.prisma.payment.findUnique({ where: { id: local.paymentId } });
  let intentId = payment.providerPaymentId; let clientSecret = payment.data?.clientSecret;
  if (!intentId) {
    const created = await createPayment({ provider, order: { id: '', orderNumber: '', checkPaymentId: payment.id }, amount: payment.amount, currency: payment.currencyCode, idempotencyKey: hash('checkpay:' + payment.id) });
    intentId = created.paymentIntentId; clientSecret = created.clientSecret;
    await c.prisma.payment.updateMany({ where: { id: payment.id, providerPaymentId: '' }, data: { providerPaymentId: intentId, status: 'processing', data: { clientSecret, checkId: a.checkId } } });
  }
  return { paymentId: payment.id, amountCents: payment.amount, clientSecret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_KEY || '' };
}

/** Settles a check from what Stripe reports. Safe to call again; used by the screen and the webhook. */
export async function settleCheckCard(c: any, paymentId: string) {
  const payment = await c.prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.checkId) throw new Error('Payment not found');
  if (payment.status === 'succeeded') return { status: 'paid', checkId: payment.checkId };
  if (!LIVE_PAY.includes(payment.status) || !payment.providerPaymentId) return { status: payment.status, checkId: payment.checkId };
  const provider = await stripeProvider(c);
  let observed: any;
  try { observed = await getPaymentStatus({ provider, paymentId: payment.providerPaymentId }); } catch { return { status: 'unknown', checkId: payment.checkId }; }
  if (observed.status !== 'succeeded') {
    // a fresh intent is also requires_payment_method; only a recorded card error counts as declined
    const declined = observed.status === 'canceled' || (observed.status === 'requires_payment_method' && !!observed.data?.last_payment_error);
    return { status: declined ? 'declined' : 'pending', checkId: payment.checkId, message: declined ? String(observed.data?.last_payment_error?.message || 'Card declined').slice(0, 200) : '' };
  }
  assertCheckoutProviderObservation(observed, payment.amount, payment.currencyCode);
  return c.prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, 'check:' + payment.checkId);
    const p = await tx.payment.findUnique({ where: { id: payment.id }, include: { check: true } });
    if (p.status === 'succeeded') return { status: 'paid', checkId: p.checkId };
    if (p.check.status !== 'presented' || p.check.totalCents !== p.amount) throw new Error('Check changed while the card was charged; reconcile it');
    await tx.payment.update({ where: { id: p.id }, data: { status: 'succeeded', processedAt: new Date(), errorMessage: '' } });
    await tx.check.update({ where: { id: p.checkId }, data: { status: 'paid' } });
    await tx.seatingAssignment.updateMany({ where: { id: p.check.seatingAssignmentId, status: 'seated' }, data: { status: 'closed' } });
    await tx.tableOccupancy.updateMany({ where: { assignmentId: p.check.seatingAssignmentId }, data: { occupancyKey: null } });
    await audit(tx, c, 'paid_card', 'Check', p.checkId, { status: 'presented' }, { status: 'paid', paymentId: p.id, amount: p.amount, intent: p.providerPaymentId });
    return { status: 'paid', checkId: p.checkId };
  }, { timeout: 20000 });
}

export async function completeCheckCardPayment(_: any, a: any, c: any) {
  requirePermission(c, 'canManageChecks');
  const payment = await c.prisma.payment.findUnique({ where: { id: String(a.paymentId || '') } });
  if (!payment?.checkId || payment.checkId !== a.checkId) throw new Error('Payment not found');
  return settleCheckCard(c, payment.id);
}

export async function cancelCheckCardPayment(_: any, a: any, c: any) {
  requirePermission(c, 'canManageChecks');
  const payment = await c.prisma.payment.findUnique({ where: { id: String(a.paymentId || '') } });
  if (!payment?.checkId || payment.checkId !== a.checkId) throw new Error('Payment not found');
  if (!LIVE_PAY.includes(payment.status)) throw new Error('This payment is ' + payment.status);
  if (payment.providerPaymentId) {
    const provider = await stripeProvider(c);
    const r = await cancelPayment({ provider, paymentId: payment.providerPaymentId, idempotencyKey: hash('checkpay-cancel:' + payment.id) });
    if (r.status === 'succeeded') { await settleCheckCard(c, payment.id); throw new Error('The card was already charged; the check is paid'); }
    if (r.status !== 'cancelled') throw new Error('Stripe did not cancel the payment; try again');
  }
  return command(c, 'cancelCheckCardPayment', a, async tx => {
    const p = await tx.payment.findUnique({ where: { id: payment.id } });
    if (!LIVE_PAY.includes(p.status)) throw new Error('This payment is ' + p.status);
    await tx.payment.update({ where: { id: p.id }, data: { status: 'cancelled', errorMessage: String(a.reason || 'Cancelled at the table').slice(0, 200) } });
    const reopened = await tx.check.updateMany({ where: { id: p.checkId, status: 'presented' }, data: { status: 'open' } });
    await audit(tx, c, 'card_cancelled', 'Check', p.checkId, { status: 'presented', paymentId: p.id }, { status: reopened.count ? 'open' : 'unchanged' }, String(a.reason || ''));
    return { status: 'cancelled', checkId: p.checkId };
  }, 'check:' + a.checkId);
}
