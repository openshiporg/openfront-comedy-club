import { showCapacity } from '../lib/capacity';
import crypto from 'node:crypto';
import { audit, code, hash } from '../lib/commands';
import { offerExpiry, planOffers } from '../lib/waitlist';

/**
 * Runs inside a transaction that already holds the show lock. Settles finished offers, then turns
 * freed capacity into new offers in join order. Each offer is a real InventoryHold; nothing is emailed from here.
 */
export async function offerFreedSeats(tx: any, context: any, showId: string) {
  const now = new Date();
  const synced = await tx.waitlistEntry.findMany({ where: { showId, status: 'offered' }, include: { hold: true } });
  for (const e of synced) {
    const next = e.hold?.status === 'converted' ? 'converted' : !e.hold || ['expired', 'released'].includes(e.hold.status) ? 'expired' : null;
    if (!next) continue;
    const moved = await tx.waitlistEntry.updateMany({ where: { id: e.id, status: 'offered' }, data: { status: next } });
    if (moved.count === 1) await audit(tx, context, next, 'WaitlistEntry', e.id, { status: 'offered' }, { status: next });
  }
  const show = await tx.show.findUnique({ where: { id: showId }, include: { room: true } });
  if (!show || !['on_sale', 'sold_out'].includes(show.status) || show.startsAt <= now) return [];
  const tiers = await tx.priceTier.findMany({ where: { showId } });
  const totals = await tx.priceTier.aggregate({ where: { showId }, _sum: { sold: true, held: true } });
  const remaining = showCapacity(show) - (totals._sum.sold || 0) - (totals._sum.held || 0);
  // Checkout only accepts holds on an on_sale show, so freed seats reopen it.
  if (show.status === 'sold_out' && remaining > 0) await tx.show.update({ where: { id: showId }, data: { status: 'on_sale' } });
  const waiting = await tx.waitlistEntry.findMany({ where: { showId, status: 'waiting' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (!waiting.length) return [];
  const expiresAt = offerExpiry(now, show.startsAt);
  if (!expiresAt || remaining < 1) return [];
  const plan = planOffers(waiting.map((w: any) => ({ id: w.id, partySize: w.partySize, createdAt: w.createdAt })), tiers, remaining, now);
  const made: string[] = [];
  for (const o of plan) {
    const entry = waiting.find((w: any) => w.id === o.entryId);
    const claimed = await tx.waitlistEntry.updateMany({ where: { id: entry.id, status: 'waiting' }, data: { status: 'offered', offeredAt: now, offerExpiresAt: expiresAt } });
    if (claimed.count !== 1) continue;
    const token = crypto.randomBytes(32).toString('hex');
    const hold = await tx.inventoryHold.create({ data: { holdKey: code('H'), showId, priceTierId: o.tierId, quantity: o.quantity, cartToken: hash(token), status: 'active', expiresAt, waitlistEntryId: entry.id } });
    await tx.priceTier.update({ where: { id: o.tierId }, data: { held: { increment: o.quantity } } });
    await audit(tx, context, 'offered', 'WaitlistEntry', entry.id, { status: 'waiting' }, { status: 'offered', holdKey: hold.holdKey, quantity: o.quantity, expiresAt });
    made.push(entry.id);
  }
  return made;
}
