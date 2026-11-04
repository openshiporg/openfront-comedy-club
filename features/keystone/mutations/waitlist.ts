import { showCapacity } from '../lib/capacity';
import { audit, code, command, hash, lockTransactionKey, prove, requirePermission } from '../lib/commands';
import { tierFor } from '../lib/waitlist';
import { expireUnderLock } from './tickets';
import { offerFreedSeats } from './waitlistCore';

/** Public: join the line for a show that cannot sell this party size right now. */
export async function joinWaitlist(_: any, a: any, c: any) {
  const name = String(a.name || '').trim(), email = String(a.email || '').trim().toLowerCase(), size = a.partySize;
  if (!name || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('Name and email required');
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new Error('Choose a party of 1–20');
  return command(c, 'joinWaitlist', a, async tx => {
    await expireUnderLock(tx, a.showId, c);
    const show = await tx.show.findUnique({ where: { id: a.showId }, include: { room: true } });
    if (!show || !['on_sale', 'sold_out'].includes(show.status) || show.startsAt <= new Date()) throw new Error('This show has no waitlist');
    const tiers = await tx.priceTier.findMany({ where: { showId: show.id } });
    const totals = await tx.priceTier.aggregate({ where: { showId: show.id }, _sum: { sold: true, held: true } });
    const remaining = showCapacity(show) - (totals._sum.sold || 0) - (totals._sum.held || 0);
    if (tierFor(size, tiers, remaining, new Date())) throw new Error('Tickets are available; no waitlist needed');
    if (await tx.waitlistEntry.count({ where: { showId: show.id, email, status: { in: ['waiting', 'offered'] } } })) throw new Error('This email is already on the waitlist');
    const entry = await tx.waitlistEntry.create({ data: { entryKey: code('W'), showId: show.id, name, email, partySize: size, status: 'waiting' } });
    await audit(tx, c, 'joined', 'WaitlistEntry', entry.id, null, { partySize: size });
    return { entryKey: entry.entryKey, position: await tx.waitlistEntry.count({ where: { showId: show.id, status: 'waiting', createdAt: { lte: entry.createdAt } } }) };
  }, 'show:' + a.showId);
}

/** Public: the holder of an offer link reads what is held for them. Proof is the hold token. */
export async function waitlistOffer(_: any, a: any, c: any) {
  const hold = await c.prisma.inventoryHold.findUnique({ where: { holdKey: a.holdKey }, include: { show: true, waitlistEntry: true } });
  prove(hold, a.cartToken);
  if (!hold.waitlistEntryId) throw new Error('Not found');
  const live = hold.status === 'active' && hold.expiresAt > new Date();
  return { holdKey: hold.holdKey, live, expiresAt: hold.expiresAt, quantity: hold.quantity, showId: hold.showId, title: hold.show.title, ageRestriction: hold.show.ageRestriction };
}

/** Operator: settle finished offers and offer any freed seats now. */
export async function offerWaitlist(_: any, a: any, c: any) {
  requirePermission(c, 'canManageOrders');
  return command(c, 'offerWaitlist', a, async tx => {
    await expireUnderLock(tx, a.showId, c);
    const offered = await offerFreedSeats(tx, c, a.showId);
    return { offered: offered.length };
  }, 'show:' + a.showId);
}

/** Operator: take a party off the line, releasing any seats held for them, then pass them on. */
export async function removeWaitlistEntry(_: any, a: any, c: any) {
  requirePermission(c, 'canManageOrders');
  return command(c, 'removeWaitlistEntry', a, async tx => {
    const first = await tx.waitlistEntry.findUnique({ where: { id: a.entryId } }); if (!first) throw new Error('Entry not found');
    await lockTransactionKey(tx, 'show:' + first.showId);
    const entry = await tx.waitlistEntry.findUnique({ where: { id: a.entryId }, include: { hold: true } });
    if (!entry || !['waiting', 'offered'].includes(entry.status)) throw new Error('Entry is already closed');
    if (entry.hold?.status === 'active') {
      if (await tx.ticketOrder.count({ where: { hold: { id: entry.hold.id }, status: 'pending_payment' } })) throw new Error('This party is paying now');
      await tx.inventoryHold.update({ where: { id: entry.hold.id }, data: { status: 'released' } });
      await tx.priceTier.update({ where: { id: entry.hold.priceTierId }, data: { held: { decrement: entry.hold.quantity } } });
    }
    const moved = await tx.waitlistEntry.updateMany({ where: { id: entry.id, status: entry.status }, data: { status: 'cancelled' } });
    if (moved.count !== 1) throw new Error('State changed');
    await audit(tx, c, 'cancelled', 'WaitlistEntry', entry.id, { status: entry.status }, { status: 'cancelled' }, a.reason || '');
    const offered = await offerFreedSeats(tx, c, entry.showId);
    return { id: entry.id, offered: offered.length };
  });
}
