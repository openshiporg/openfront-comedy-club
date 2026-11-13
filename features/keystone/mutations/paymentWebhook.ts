import { handleWebhookFunction } from '../../integrations/payment/stripe';
import { verifyAndFinalize } from './checkout';
import { settleCheckCard } from './checkPay';

/** Signed (raw-byte) Stripe webhook with a durable, deduplicated inbox. Settlement re-reads the provider, never trusts the payload. */
export async function handlePaymentWebhook(context: any, rawBody: string, headers: Record<string, string>) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  const verified = await handleWebhookFunction({ event: null, headers, rawBody });
  const event = verified.event as any;
  // the event mode must match the key mode (test events never settle on a live key and the reverse)
  if (Boolean(event.livemode) !== process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) throw new Error('Stripe event mode does not match the configured key');
  const db = context.prisma;
  const eventKey = `pp_stripe:${event.id}`;
  const inbox = await db.paymentWebhookEvent.upsert({ where: { eventKey }, update: {}, create: { eventKey, providerCode: 'pp_stripe', providerEventId: event.id, eventType: event.type, status: 'received', payload: { id: event.id, type: event.type, resourceId: (verified.resource as any)?.id }, attempts: 0 } });
  if (['processed', 'ignored'].includes(inbox.status)) return { success: true, status: inbox.status, duplicate: true };
  await db.paymentWebhookEvent.update({ where: { id: inbox.id }, data: { attempts: { increment: 1 } } });
  if (event.type !== 'payment_intent.succeeded') {
    const unsupported = event.type.startsWith('refund.') || event.type === 'charge.refunded';
    await db.paymentWebhookEvent.update({ where: { id: inbox.id }, data: { status: unsupported ? 'failed' : 'ignored', error: unsupported ? 'Refund reconciliation requires operator review' : '', processedAt: unsupported ? null : new Date() } });
    return { success: !unsupported, status: unsupported ? 'failed' : 'ignored' };
  }
  try {
    const intent = verified.resource as any;
    const checkPaymentId = intent?.metadata?.checkPaymentId;
    if (checkPaymentId) {
      const payment = await db.payment.findUnique({ where: { id: checkPaymentId } });
      if (intent?.status !== 'succeeded' || !payment?.checkId || payment.providerPaymentId !== intent.id) throw new Error('Payment does not match the check');
      const result = await settleCheckCard(context, payment.id);
      if (result.status !== 'paid') throw new Error('Check not settled: ' + result.status);
      await db.paymentWebhookEvent.update({ where: { id: inbox.id }, data: { status: 'processed', paymentId: payment.id, processedAt: new Date(), error: '' } });
      return { success: true, status: 'processed' };
    }
    const orderId = intent?.metadata?.orderId;
    if (intent?.status !== 'succeeded' || !orderId) throw new Error('Order correlation missing');
    const order = await db.ticketOrder.findUnique({ where: { id: orderId }, include: { paymentCollection: { include: { paymentSessions: true } } } });
    const session = order?.paymentCollection?.paymentSessions?.find((s: any) => s.isSelected);
    if (!order || session?.data?.paymentIntentId !== intent.id) throw new Error('Payment does not match the order');
    const result = order.status === 'paid' ? { status: 'paid' } : await verifyAndFinalize(context, order);
    if (result.status !== 'paid') throw new Error('Order not settled: ' + result.status);
    const payment = await db.payment.findUnique({ where: { idempotencyKey: 'pay:' + order.id } });
    await db.paymentWebhookEvent.update({ where: { id: inbox.id }, data: { status: 'processed', paymentId: payment?.id || null, processedAt: new Date(), error: '' } });
    return { success: true, status: 'processed' };
  } catch (error) {
    await db.paymentWebhookEvent.update({ where: { id: inbox.id }, data: { status: 'failed', error: 'Settlement failed; retry the verified event or reconcile manually' } });
    throw error;
  }
}
