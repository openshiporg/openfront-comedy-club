// Opt-in check against the scratch DB: a show with no room must not crash capacity maths. Run: node --import tsx scripts/verify/no-room-capacity.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict';
import { offerFreedSeats } from '../../features/keystone/mutations/waitlistCore';
import { joinWaitlist } from '../../features/keystone/mutations/waitlist';
import { createTicketHold } from '../../features/keystone/mutations/tickets';
const p = new PrismaClient();
async function main() { let showId = '';
  try {
    const show = await p.show.create({ data: { title: 'NO ROOM FIXTURE', startsAt: new Date(Date.now() + 30 * 3600e3), status: 'sold_out', capacity: 4, occurrenceKey: 'nr-' + randomUUID() } as any }); showId = show.id;
    const tier = await p.priceTier.create({ data: { showId, name: 'GA', priceCents: 1000, feeCents: 0, capacity: 10, sold: 4, status: 'on_sale' } as any });
    const anon: any = { prisma: p, session: null };
    // 1) sold out against the show's own cap: join is allowed, no crash
    const j = await joinWaitlist(null, { showId, name: 'Wait Er', email: 'wait@example.test', partySize: 2, idempotencyKey: randomUUID() }, anon); assert.equal(j.position, 1);
    // 2) offerFreedSeats with nothing free: no throw, no offer, still sold out
    let made = await p.$transaction((tx: any) => offerFreedSeats(tx, anon, showId)); assert.deepEqual(made, []);
    assert.equal((await p.show.findUnique({ where: { id: showId } }))!.status, 'sold_out');
    // 3) free two seats: the waiting party gets a real hold, capped by the show's own cap
    await p.priceTier.update({ where: { id: tier.id }, data: { sold: 2 } });
    made = await p.$transaction((tx: any) => offerFreedSeats(tx, anon, showId)); assert.equal(made.length, 1);
    assert.equal((await p.show.findUnique({ where: { id: showId } }))!.status, 'on_sale');
    // 4) a hold for more than the remaining cap is refused (no oversell with no room)
    await assert.rejects(() => createTicketHold(null, { showId, tierId: tier.id, quantity: 3, idempotencyKey: randomUUID() }, anon), /capacity|available|enough/i);
    console.log('PASS no-room capacity: join, no-op offer, real offer, oversell refused');
  } finally {
    if (showId) { await p.notificationRecord.deleteMany({ where: { showId } }); await p.inventoryHold.deleteMany({ where: { showId } }).catch(() => {}); await p.waitlistEntry.deleteMany({ where: { showId } }).catch(() => {}); await p.priceTier.deleteMany({ where: { showId } }).catch(() => {}); await p.show.delete({ where: { id: showId } }).catch((e: any) => console.log('show kept:', String(e.message).slice(0, 60))); }
    await p.$disconnect();
  } }
main();
