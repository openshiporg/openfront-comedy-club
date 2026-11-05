// Opt-in check against the scratch DB: move a seated party (its open check follows), unseat a party with no check (it waits again
// and its tables are free), and the refusals: taken table, too few seats, another room, open check on unseat, not live, replay.
// Run: node --import tsx scripts/verify/seating-move.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict';
import { issueComp } from '../../features/keystone/mutations/night';
import { seatParty, openCheck } from '../../features/keystone/mutations/operators';
import { moveParty, unseatParty } from '../../features/keystone/mutations/seating';
const p = new PrismaClient(); const k = () => randomUUID();
async function main() { const shows: string[] = []; try {
  const owner = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(owner);
  const staff: any = { prisma: p, session: { itemId: owner.id, data: { role: owner.role } } };
  const room = await p.room.findFirst({ where: { seatingMode: 'tables', active: true }, include: { sections: { include: { tables: { orderBy: { label: 'asc' } } } } } }); assert(room, 'a table room');
  const all = room.sections.flatMap((s: any) => s.tables); const other = await p.table.findFirst({ where: { section: { roomId: { not: room.id } } } });
  const twos = all.filter((t: any) => t.seats >= 2); assert(twos.length >= 4, 'four tables of 2+');
  const one = all.find((t: any) => t.seats === 1) || null;
  const d = new Date(Date.now() + 864e5); const show = await p.show.create({ data: { title: 'SEATING MOVE CHECK', startsAt: d, doorsAt: new Date(d.getTime() - 36e5), endsAt: new Date(d.getTime() + 54e5), status: 'on_sale', roomId: room.id, capacity: 40, occurrenceKey: 'sm-' + k() } as any }); shows.push(show.id);
  const tier = await p.priceTier.create({ data: { showId: show.id, name: 'GA', priceCents: 2000, feeCents: 0, capacity: 40, status: 'on_sale' } as any });
  const comp = async (name: string) => { await issueComp(null, { showId: show.id, tierId: tier.id, quantity: 2, recipientName: name, recipientEmail: `${name.toLowerCase()}@example.test`, reason: 'press', idempotencyKey: k() }, staff); return (await p.ticketOrder.findFirst({ where: { showId: show.id, name }, orderBy: { createdAt: 'desc' } }))!; };
  const oa = await comp('Alpha'); const ob = await comp('Bravo');
  const [t1, t2, t3, t4] = twos;
  const sa: any = await seatParty(null, { orderId: oa.id, tableIds: [t1.id], showId: show.id, idempotencyKey: k() }, staff);
  const sb: any = await seatParty(null, { orderId: ob.id, tableIds: [t2.id], showId: show.id, idempotencyKey: k() }, staff);
  const check: any = await openCheck(null, { seatingAssignmentId: sa.id, idempotencyKey: k() }, staff);
  // refusals
  await assert.rejects(moveParty(null, { assignmentId: sa.id, tableIds: [t2.id], idempotencyKey: k() }, staff), /is taken/);
  await assert.rejects(moveParty(null, { assignmentId: sa.id, tableIds: [t1.id], idempotencyKey: k() }, staff), /already at these tables/);
  if (one) await assert.rejects(moveParty(null, { assignmentId: sa.id, tableIds: [one.id], idempotencyKey: k() }, staff), /Not enough seats/);
  if (other) await assert.rejects(moveParty(null, { assignmentId: sa.id, tableIds: [other.id], idempotencyKey: k() }, staff), /in this room/);
  await assert.rejects(unseatParty(null, { assignmentId: sa.id, idempotencyKey: k() }, staff), /open check/);
  // move with an open check: tables swap, check follows, replay is the same answer
  const key = k(); const mv: any = await moveParty(null, { assignmentId: sa.id, tableIds: [t3.id], reason: 'Heckler nearby', idempotencyKey: key }, staff);
  assert.deepEqual(mv.tables, [t3.label]); assert.deepEqual(await moveParty(null, { assignmentId: sa.id, tableIds: [t3.id], reason: 'Heckler nearby', idempotencyKey: key }, staff), mv);
  await assert.rejects(moveParty(null, { assignmentId: sa.id, tableIds: [t4.id], reason: 'Heckler nearby', idempotencyKey: key }, staff), /different request/);
  const occ = await p.tableOccupancy.findMany({ where: { showId: show.id, occupancyKey: { not: null } }, select: { tableId: true, assignmentId: true } });
  assert(occ.some((o) => o.tableId === t3.id && o.assignmentId === sa.id) && !occ.some((o) => o.tableId === t1.id), 'old table freed, new one held');
  assert.equal((await p.check.findUnique({ where: { id: check.id } }))!.seatingAssignmentId, sa.id, 'check follows the party');
  // t1 is free again: Bravo can move there
  await moveParty(null, { assignmentId: sb.id, tableIds: [t1.id], idempotencyKey: k() }, staff);
  // unseat Bravo (no check): tables freed, order waits again, can be seated again
  const un: any = await unseatParty(null, { assignmentId: sb.id, reason: 'Seated by mistake', idempotencyKey: k() }, staff); assert.equal(un.orderId, ob.id);
  assert.equal(await p.tableOccupancy.count({ where: { showId: show.id, assignmentId: sb.id, occupancyKey: { not: null } } }), 0);
  assert.equal((await p.seatingAssignment.findUnique({ where: { id: sb.id } }))!.status, 'unseated');
  assert.equal((await p.ticketOrder.findUnique({ where: { id: ob.id }, include: { tableAssignment: true } }))!.tableAssignment, null, 'order waits again');
  await assert.rejects(unseatParty(null, { assignmentId: sb.id, idempotencyKey: k() }, staff), /not seated/);
  const again: any = await seatParty(null, { orderId: ob.id, tableIds: [t4.id], showId: show.id, idempotencyKey: k() }, staff); assert(again.id !== sb.id);
  // not live
  await p.show.update({ where: { id: show.id }, data: { status: 'completed' } });
  await assert.rejects(moveParty(null, { assignmentId: again.id, tableIds: [t2.id], idempotencyKey: k() }, staff), /not live/);
  assert.equal(await p.auditEvent.count({ where: { targetId: { in: [sa.id, sb.id] }, action: { in: ['moved', 'unseated'] } } }), 3);
  console.log('PASS seating: moved with open check (check follows, old table freed, replay same), unseated and reseated; taken, same, seats, room, open check, not live refused');
} finally {
  if (shows.length) { await p.tableOccupancy.updateMany({ where: { showId: { in: shows } }, data: { occupancyKey: null } }); await p.check.updateMany({ where: { showId: { in: shows }, status: 'open' }, data: { status: 'voided' } }); await p.show.updateMany({ where: { id: { in: shows } }, data: { status: 'cancelled' } }); }
  await p.$disconnect();
} }
main().catch((e) => { console.error(e); process.exit(1); });
