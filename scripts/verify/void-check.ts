// Opt-in check against the scratch DB: void a whole open check with an independent approval for its exact live subtotal.
// Success: the party stays seated and can get a new check; a walkout closes the seating and frees its tables; replay returns the same answer.
// Refusals: no approval, self-approval, approval for another amount, check with a payment, already voided, missing reason.
// Run: node --import tsx scripts/verify/void-check.ts
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict';
import { issueComp, voidCheck, requestApproval } from '../../features/keystone/mutations/night';
import { seatParty, openCheck, addCheckItem } from '../../features/keystone/mutations/operators';
import { unseatParty } from '../../features/keystone/mutations/seating';
import { approveManagerApproval } from '../../features/keystone/utils/managerApproval';
const p = new PrismaClient(); const k = () => randomUUID();
async function main() { const shows: string[] = []; try {
  const [ou, du] = await Promise.all(['owner@laughtrack.test', 'dana.whitfield@laughtrack.test'].map((email) => p.user.findFirst({ where: { email }, include: { role: true } })));
  assert(ou && du, 'two managers');
  const staff: any = { prisma: p, session: { itemId: ou.id, data: { role: ou.role } } };
  const mgr: any = { prisma: p, session: { itemId: du.id, data: { role: du.role } } };
  const room = await p.room.findFirst({ where: { seatingMode: 'tables', active: true }, include: { sections: { include: { tables: { orderBy: { label: 'asc' } } } } } }); assert(room);
  const twos = room.sections.flatMap((s: any) => s.tables).filter((t: any) => t.seats >= 2); assert(twos.length >= 3);
  const menu = await p.menuItem.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' }, take: 2 }); assert(menu.length);
  const d = new Date(Date.now() + 864e5); const show = await p.show.create({ data: { title: 'VOID CHECK CHECK', startsAt: d, doorsAt: new Date(d.getTime() - 36e5), endsAt: new Date(d.getTime() + 54e5), status: 'on_sale', roomId: room.id, capacity: 40, occurrenceKey: 'vc-' + k() } as any }); shows.push(show.id);
  const tier = await p.priceTier.create({ data: { showId: show.id, name: 'GA', priceCents: 2000, feeCents: 0, capacity: 40, status: 'on_sale' } as any });
  const party = async (name: string, table: any) => { await issueComp(null, { showId: show.id, tierId: tier.id, quantity: 2, recipientName: name, recipientEmail: `${name.toLowerCase()}@example.test`, reason: 'press', idempotencyKey: k() }, staff); const o = (await p.ticketOrder.findFirst({ where: { showId: show.id, name }, orderBy: { createdAt: 'desc' } }))!; return seatParty(null, { orderId: o.id, tableIds: [table.id], showId: show.id, idempotencyKey: k() }, staff) as any; };
  const approve = async (actor: any, approver: any, checkId: string, reason: string, amount: number) => { const r: any = await requestApproval(null, { actionType: 'void_check', targetId: checkId, reason, amount }, actor); await approveManagerApproval(null, { approvalId: r.id }, approver); return r.id; };
  const sa = await party('Alpha', twos[0]); const sb = await party('Bravo', twos[1]); const sc = await party('Charlie', twos[2]);
  const ca: any = await openCheck(null, { seatingAssignmentId: sa.id, idempotencyKey: k() }, staff);
  for (const m of menu) await addCheckItem(null, { checkId: ca.id, menuItemId: m.id, qty: 2, idempotencyKey: k() }, staff);
  const sub = menu.reduce((n, m) => n + (m.priceCents ?? 0) * 2, 0);
  // refusals
  await assert.rejects(voidCheck(null, { checkId: ca.id, reason: '', approvalId: 'x', idempotencyKey: k() }, staff), /Reason required/);
  await assert.rejects(voidCheck(null, { checkId: ca.id, reason: 'Wrong party', idempotencyKey: k() }, staff), /approval is required/);
  const self: any = await requestApproval(null, { actionType: 'void_check', targetId: ca.id, reason: 'Wrong party', amount: sub }, staff);
  await assert.rejects(approveManagerApproval(null, { approvalId: self.id }, staff), /cannot approve their own/);
  const wrongAmount = await approve(staff, mgr, ca.id, 'Wrong party', sub - 1);
  await assert.rejects(voidCheck(null, { checkId: ca.id, reason: 'Wrong party', approvalId: wrongAmount, idempotencyKey: k() }, staff), /does not match/);
  // success, party stays seated
  const ok = await approve(staff, mgr, ca.id, 'Wrong party', sub); const key = k();
  const r: any = await voidCheck(null, { checkId: ca.id, reason: 'Wrong party', approvalId: ok, idempotencyKey: key }, staff);
  assert.equal(r.voidedCents, sub); assert.equal(r.leftVenue, false);
  assert.deepEqual(await voidCheck(null, { checkId: ca.id, reason: 'Wrong party', approvalId: ok, idempotencyKey: key }, staff), r, 'replay');
  const vc = (await p.check.findUnique({ where: { id: ca.id } }))!; assert.equal(vc.status, 'voided'); assert.equal(vc.totalCents, 0);
  assert.equal((await p.managerApproval.findUnique({ where: { id: ok } }))!.status, 'consumed');
  await assert.rejects(voidCheck(null, { checkId: ca.id, reason: 'Wrong party', approvalId: ok, idempotencyKey: k() }, staff), /cannot be voided/);
  assert.equal((await p.seatingAssignment.findUnique({ where: { id: sa.id } }))!.status, 'seated');
  const again: any = await openCheck(null, { seatingAssignmentId: sa.id, idempotencyKey: k() }, staff); assert(again.id !== ca.id, 'new check after void');
  // walkout: tables freed, assignment closed
  const cb: any = await openCheck(null, { seatingAssignmentId: sb.id, idempotencyKey: k() }, staff);
  await addCheckItem(null, { checkId: cb.id, menuItemId: menu[0].id, qty: 1, idempotencyKey: k() }, staff);
  const okb = await approve(staff, mgr, cb.id, 'Walked out', menu[0].priceCents ?? 0);
  const rb: any = await voidCheck(null, { checkId: cb.id, reason: 'Walked out', approvalId: okb, leftVenue: true, idempotencyKey: k() }, staff); assert.equal(rb.leftVenue, true);
  assert.equal((await p.seatingAssignment.findUnique({ where: { id: sb.id } }))!.status, 'closed');
  assert.equal(await p.tableOccupancy.count({ where: { assignmentId: sb.id, occupancyKey: { not: null } } }), 0, 'tables freed');
  // empty check voided then party unseated (voided check does not block unseat)
  const cc: any = await openCheck(null, { seatingAssignmentId: sc.id, idempotencyKey: k() }, staff);
  const okc = await approve(staff, mgr, cc.id, 'Opened by mistake', 0);
  await voidCheck(null, { checkId: cc.id, reason: 'Opened by mistake', approvalId: okc, idempotencyKey: k() }, staff);
  await unseatParty(null, { assignmentId: sc.id, reason: 'Seated by mistake', idempotencyKey: k() }, staff);
  // a check with a payment is refused
  const provider = await p.paymentProvider.findFirst();
  await p.payment.create({ data: { idempotencyKey: 'vc-pay-' + k(), amount: 100, currencyCode: 'USD', status: 'succeeded', paymentMethod: 'cash', checkId: again.id, paymentProviderId: provider?.id || null } as any });
  const okp = await approve(staff, mgr, again.id, 'Wrong party', 0);
  await assert.rejects(voidCheck(null, { checkId: again.id, reason: 'Wrong party', approvalId: okp, idempotencyKey: k() }, staff), /has a payment/);
  assert.equal((await p.managerApproval.findUnique({ where: { id: okp } }))!.status, 'approved', 'refused void leaves the approval unconsumed');
  assert.equal(await p.auditEvent.count({ where: { targetId: { in: [ca.id, cb.id, cc.id] }, action: 'voided' } }), 3);
  console.log('PASS void check: party stays (new check opens), walkout frees tables, empty check then unseat, replay same; reason, no approval, self-approval, wrong amount, already voided, paid check refused');
} finally {
  if (shows.length) { await p.payment.deleteMany({ where: { check: { showId: { in: shows } } } }); await p.tableOccupancy.updateMany({ where: { showId: { in: shows } }, data: { occupancyKey: null } }); await p.check.updateMany({ where: { showId: { in: shows }, status: 'open' }, data: { status: 'voided' } }); await p.show.updateMany({ where: { id: { in: shows } }, data: { status: 'cancelled' } }); }
  await p.$disconnect();
} }
main().catch((e) => { console.error(e); process.exit(1); });
