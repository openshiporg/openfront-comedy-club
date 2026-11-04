import { audit, command, lockTransactionKey, requirePermission } from '../lib/commands';
import { inReminderWindow, lineupConfirmationKey, lineupConfirmationMessage, reminderSendAfter, showReminderKey, showReminderMessage } from '../lib/reminders';

async function venueInfo(db: any) {
  const v = await db.venue.findFirst({ select: { timezone: true, name: true } });
  return { tz: v?.timezone || 'America/Chicago', name: v?.name || '' };
}

/** Queue a message once. The unique key makes a rerun a no-op; returns whether a new row was made. */
async function queueOnce(tx: any, data: any) {
  if (await tx.notificationRecord.findUnique({ where: { notificationKey: data.notificationKey }, select: { id: true } })) return false;
  await tx.notificationRecord.create({ data: { channel: 'email', status: 'queued', ...data } });
  return true;
}

/** Inside a transaction holding the show lock: one reminder per paid order that has live tickets and an email. */
export async function queueShowReminders(tx: any, showId: string, now = new Date()) {
  const show = await tx.show.findUnique({ where: { id: showId } });
  if (!show || ['cancelled', 'draft', 'completed', 'settled'].includes(show.status) || !inReminderWindow(show.startsAt, now)) return { queued: 0, skipped: 0 };
  const { tz, name } = await venueInfo(tx);
  const sendAfter = reminderSendAfter(show.startsAt, tz, now);
  const orders = await tx.ticketOrder.findMany({ where: { showId, status: { in: ['paid', 'partially_refunded', 'comp'] }, email: { not: '' }, tickets: { some: { status: 'valid' } } }, select: { id: true, email: true, name: true, partySize: true, orderNumber: true } });
  let queued = 0;
  for (const o of orders) {
    const msg = showReminderMessage(o, show, tz, name);
    if (await queueOnce(tx, { notificationKey: showReminderKey(o.id), kind: 'show_reminder', toEmail: o.email, showId, sendAfter, subject: msg.subject, body: msg.body, payload: { orderId: o.id } })) queued++;
  }
  return { queued, skipped: orders.length - queued };
}

/** A confirmed slot gets one confirmation for the comedian, if we have an email for them. */
export async function queueLineupConfirmation(tx: any, slotId: string) {
  const slot = await tx.lineupSlot.findUnique({ where: { id: slotId }, include: { show: true, comedian: true } });
  if (!slot || slot.status !== 'confirmed' || !slot.comedian?.email) return false;
  const { tz, name } = await venueInfo(tx);
  const msg = lineupConfirmationMessage({ name: slot.comedian.stageName }, slot.show, slot, tz, name);
  return queueOnce(tx, { notificationKey: lineupConfirmationKey(slot.id), kind: 'lineup_confirmation', toEmail: slot.comedian.email, showId: slot.showId, sendAfter: new Date(), subject: msg.subject, body: msg.body, payload: { slotId: slot.id, comedianId: slot.comedianId } });
}

/** Anything still queued for a thing that no longer applies is cancelled, never deleted. */
export async function cancelQueued(tx: any, where: any) {
  const r = await tx.notificationRecord.updateMany({ where: { ...where, status: 'queued' }, data: { status: 'cancelled' } });
  return r.count as number;
}

/** Operator: queue reminders for one show now. */
export async function scheduleShowReminders(_: any, a: any, c: any) {
  requirePermission(c, 'canManageOrders');
  return command(c, 'scheduleShowReminders', a, async tx => {
    await lockTransactionKey(tx, 'show:' + a.showId);
    const r = await queueShowReminders(tx, a.showId);
    await audit(tx, c, 'reminders_queued', 'Show', a.showId, null, r);
    return r;
  }, 'show:' + a.showId);
}

/** Cron: queue reminders for every show starting inside the window. Same secret rule as the checkout sweep. */
export async function sweepShowReminders(_: any, { secret }: { secret: string }, c: any) {
  const expected = process.env.CRON_SECRET;
  if (!expected || secret !== expected) throw new Error('Not authorized');
  const now = new Date();
  const shows = await c.prisma.show.findMany({ where: { startsAt: { gt: now, lte: new Date(now.getTime() + 48 * 3600e3) }, status: { in: ['on_sale', 'sold_out', 'doors_open'] } }, select: { id: true }, take: 50 });
  let queued = 0, failed = 0;
  for (const s of shows) {
    try { const r = await c.prisma.$transaction(async (tx: any) => { await lockTransactionKey(tx, 'show:' + s.id); return queueShowReminders(tx, s.id, now); }); queued += r.queued; } catch { failed++; }
  }
  return { shows: shows.length, queued, failed };
}
