import { permissions, type Session } from '../access';
import type { PrismaClient } from '@prisma/client';

type DoorContext = { session?: Session; prisma: PrismaClient };

const LIVE = ['on_sale', 'sold_out', 'doors_open', 'in_progress', 'completed'] as const;

/**
 * Door and floor staff read: the Tonight screen's data for a role that can run the door but cannot read shows, orders or money.
 * Exposes only the show list, the room's tables, the running order, who is seated, the unseated paid parties and guest search.
 * No prices, fees, payouts, emails or phone numbers.
 */
export async function doorBoard(_: unknown, a: { showId?: string; term?: string }, c: DoorContext) {
  const can = { door: permissions.canManageDoor(c), checks: permissions.canManageChecks(c), shows: permissions.canManageShows(c) };
  if (!c.session?.itemId || !(can.door || can.checks || can.shows)) throw new Error('Not authorized');
  const db = c.prisma;
  const num = (v: unknown) => Number(v);
  const since = new Date(Date.now() - 6 * 3600000);
  const shows = await db.show.findMany({ where: { startsAt: { gte: since }, status: { in: [...LIVE] } }, orderBy: { startsAt: 'asc' }, take: 20, select: { id: true, title: true, startsAt: true, status: true } });
  const current = shows.find((s) => s.id === a.showId) || shows[0];
  if (!current) return { shows, show: null, found: [], can };
  const live = { in: ['valid', 'checked_in'] as ('valid' | 'checked_in')[] };
  const [s, soldCount, heldAgg, checkedInCount, tiers] = await Promise.all([
    db.show.findUnique({
      where: { id: current.id },
      select: {
        id: true, title: true, startsAt: true, doorsAt: true, endsAt: true, status: true, capacity: true, ageRestriction: true,
        room: { select: { name: true, seatingMode: true, sections: { select: { name: true, tables: { select: { id: true, label: true, seats: true, x: true, y: true } } } } } },
        lineup: { orderBy: { position: 'asc' }, select: { id: true, role: true, position: true, setMinutes: true, status: true, comedian: { select: { stageName: true } } } },
        assignments: { where: { status: 'seated' }, select: { id: true, status: true, partySize: true, tables: { select: { id: true, label: true } }, ticketOrder: { select: { name: true, orderNumber: true } }, checks: { where: { status: { in: ['open', 'presented'] } }, select: { id: true } } } },
        occupancies: { where: { occupancyKey: { not: null } }, select: { table: { select: { id: true } }, hold: { select: { id: true } }, assignment: { select: { id: true } } } },
        orders: { where: { status: { in: ['paid', 'partially_refunded', 'comp'] }, tableAssignment: null }, take: 100, select: { id: true, name: true, partySize: true, orderNumber: true } },
        checks: { where: { status: { in: ['open', 'presented'] } }, select: { id: true, status: true, guestCount: true, minimumItemsRequired: true, seatingAssignment: { select: { tables: { select: { label: true } } } }, items: { where: { voided: false, countsTowardMinimum: true }, select: { qty: true } } } },
      },
    }),
    db.ticket.count({ where: { showId: current.id, status: live } }),
    db.inventoryHold.aggregate({ where: { showId: current.id, status: 'active', expiresAt: { gt: new Date() } }, _sum: { quantity: true } }),
    db.ticket.count({ where: { showId: current.id, status: 'checked_in' } }),
    db.priceTier.findMany({ where: { showId: current.id }, select: { sold: true, held: true } }),
  ]);
  const heldCount = heldAgg._sum.quantity || 0;
  const remaining = Math.max(0, num(s?.capacity) - tiers.reduce((n, t) => n + (t.sold ?? 0) + (t.held ?? 0), 0));
  const show = {
    ...s, soldCount, heldCount, checkedInCount, remaining,
    checks: (s?.checks ?? []).map((k) => ({ id: k.id, status: k.status, guestCount: k.guestCount, seatingAssignment: k.seatingAssignment, minimumItemsMet: k.items.reduce((n, i) => n + (i.qty ?? 0), 0) >= num(k.minimumItemsRequired) })),
  };
  const term = String(a.term || '').trim().slice(0, 80);
  const found = term ? await db.ticket.findMany({
    where: { showId: current.id, OR: [{ holderName: { contains: term, mode: 'insensitive' as const } }, { ticketCode: { contains: term, mode: 'insensitive' as const } }, { order: { OR: [{ name: { contains: term, mode: 'insensitive' as const } }, { email: { contains: term, mode: 'insensitive' as const } }, { orderNumber: { contains: term, mode: 'insensitive' as const } }] } }] },
    orderBy: { holderName: 'asc' }, take: 25, select: { id: true, ticketCode: true, status: true, holderName: true, order: { select: { orderNumber: true, name: true } } },
  }) : [];
  return { shows, show, found, can };
}
