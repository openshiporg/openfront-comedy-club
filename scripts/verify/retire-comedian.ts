// Opt-in check against the scratch DB: retire (inactive) and reactivate a comedian.
// Refusals: retiring while booked on an upcoming show, retiring twice, offering a slot to a retired comic, a bad status.
// Success: retire once the slot is declined, replay returns the same answer, history (slots) kept, audit written, reactivate works.
// Run: node --import tsx scripts/verify/retire-comedian.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict';
import { offerSlot, updateSlotStatus, setComedianStatus } from '../../features/keystone/mutations/operators';
const p = new PrismaClient(); const k = () => randomUUID();
async function main() { const shows: string[] = []; let comic: any = null; try {
  const ou = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(ou, 'owner');
  const staff: any = { prisma: p, session: { itemId: ou.id, data: { role: ou.role } } };
  const room = await p.room.findFirst({ where: { active: true } }); assert(room);
  comic = await p.comedian.create({ data: { stageName: 'Retire Check ' + k().slice(0, 6), defaultFeeCents: 5000, status: 'active' } as any });
  const d = new Date(Date.now() + 3 * 864e5);
  const show = await p.show.create({ data: { title: 'RETIRE CHECK', startsAt: d, doorsAt: new Date(d.getTime() - 36e5), endsAt: new Date(d.getTime() + 54e5), status: 'on_sale', roomId: room.id, capacity: 40, occurrenceKey: 'rc-' + k() } as any }); shows.push(show.id);
  const slot: any = await offerSlot(null, { showId: show.id, comedianId: comic.id, role: 'opener', idempotencyKey: k() }, staff);
  await assert.rejects(setComedianStatus(null, { comedianId: comic.id, status: 'gone', idempotencyKey: k() }, staff), /active or inactive/);
  await assert.rejects(setComedianStatus(null, { comedianId: comic.id, status: 'inactive', idempotencyKey: k() }, staff), /Still booked on 1 upcoming show \(RETIRE CHECK/);
  await updateSlotStatus(null, { slotId: slot.id, status: 'declined', idempotencyKey: k() }, staff);
  const key = k();
  const r: any = await setComedianStatus(null, { comedianId: comic.id, status: 'inactive', idempotencyKey: key }, staff);
  assert.equal(r.status, 'inactive');
  assert.equal((await setComedianStatus(null, { comedianId: comic.id, status: 'inactive', idempotencyKey: key }, staff) as any).status, 'inactive', 'replay');
  await assert.rejects(setComedianStatus(null, { comedianId: comic.id, status: 'inactive', idempotencyKey: k() }, staff), /Invalid state transition/);
  await assert.rejects(offerSlot(null, { showId: show.id, comedianId: comic.id, role: 'opener', idempotencyKey: k() }, staff), /is retired/);
  assert.equal(await p.lineupSlot.count({ where: { comedianId: comic.id } }), 1, 'history kept');
  assert.equal(await p.auditEvent.count({ where: { targetId: comic.id, action: 'inactive' } as any }), 1, 'one audit event');
  const back: any = await setComedianStatus(null, { comedianId: comic.id, status: 'active', idempotencyKey: k() }, staff);
  assert.equal(back.status, 'active');
  await offerSlot(null, { showId: show.id, comedianId: comic.id, role: 'feature', idempotencyKey: k() }, staff);
  console.log('PASS retire-comedian');
} finally {
  if (comic) { await p.lineupSlot.deleteMany({ where: { comedianId: comic.id } }); await p.comedian.delete({ where: { id: comic.id } }); }
  if (shows.length) await p.show.updateMany({ where: { id: { in: shows } }, data: { status: 'cancelled' } });
  await p.$disconnect();
} }
main().catch((e) => { console.error(e); process.exit(1); });
