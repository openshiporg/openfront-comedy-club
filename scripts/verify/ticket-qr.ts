// Opt-in check against the scratch DB (no Stripe): the QR printed on a ticket encodes its scan token, and the door admits that
// token like the ticket code, naming the ticket by its code. Refusals: a wrong show, a second scan, a void ticket, a forged token.
// Run: node --import tsx scripts/verify/ticket-qr.ts
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto'; import assert from 'node:assert/strict'; import fs from 'node:fs';
for (const l of fs.readFileSync(new URL('../../.env', import.meta.url).pathname, 'utf8').split('\n')) { const m = l.match(/^(SESSION_SECRET)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
import { ticketToken } from '../../features/keystone/mutations/checkout';
import { issueComp } from '../../features/keystone/mutations/night';
import { checkInTicket } from '../../features/keystone/mutations/operators';
import { describeScan } from '../../features/keystone/lib/doorQueue';
const p = new PrismaClient(); const k = () => randomUUID();
async function main() { const shows: string[] = []; try {
  const owner = await p.user.findFirst({ where: { email: 'owner@laughtrack.test' }, include: { role: true } }); assert(owner);
  const staff: any = { prisma: p, session: { itemId: owner.id, data: { role: owner.role } } };
  const room = await p.room.findFirst({ where: { active: true } }); assert(room);
  const mk = async (title: string) => { const d = new Date(Date.now() + 3 * 864e5); const s = await p.show.create({ data: { title, startsAt: d, doorsAt: new Date(d.getTime() - 36e5), endsAt: new Date(d.getTime() + 54e5), status: 'on_sale', roomId: room.id, capacity: 10, occurrenceKey: 'qr-' + k() } as any }); shows.push(s.id); const t = await p.priceTier.create({ data: { showId: s.id, name: 'GA', priceCents: 2000, feeCents: 200, capacity: 10, status: 'on_sale' } as any }); return { s, t }; };
  const a = await mk('QR CHECK A'); const b = await mk('QR CHECK B');
  await issueComp(null, { showId: a.s.id, tierId: a.t.id, quantity: 2, recipientName: 'Qr Guest', recipientEmail: 'qr@example.test', reason: 'press', idempotencyKey: k() }, staff);
  const tickets = await p.ticket.findMany({ where: { showId: a.s.id }, orderBy: { createdAt: 'asc' } }); assert.equal(tickets.length, 2);
  const [t1, t2] = tickets; const tok1 = ticketToken(t1.ticketCode);
  // the QR is exactly the token, and the stored hash matches it
  const qr = QRCode.create(tok1, { errorCorrectionLevel: 'M' }); assert(qr.modules.size >= 21);
  const segs = (qr as any).segments.map((s: any) => Buffer.from(s.data).toString('utf8')).join(''); assert.equal(segs, tok1, 'QR payload is the scan token');
  // wrong show is refused and the ticket stays valid
  const wrong: any = await checkInTicket(null, { tokenOrCode: tok1, showId: b.s.id, method: 'scan', idempotencyKey: k() }, staff); assert.equal(wrong.result, 'wrong_show');
  assert.equal((await p.ticket.findUnique({ where: { id: t1.id } }))!.status, 'valid');
  // admitted by token, named by code
  const ok: any = await checkInTicket(null, { tokenOrCode: tok1, showId: a.s.id, method: 'scan', idempotencyKey: k() }, staff);
  assert.equal(ok.result, 'admitted'); assert.equal(ok.ticketCode, t1.ticketCode); assert.equal(describeScan(tok1, ok).text, `${t1.ticketCode} (Qr Guest): admitted`);
  // a second scan of the same QR is a duplicate that says who admitted it
  const dup: any = await checkInTicket(null, { tokenOrCode: tok1, showId: a.s.id, method: 'scan', idempotencyKey: k() }, staff);
  assert.equal(dup.result, 'duplicate'); assert.equal(dup.ticketCode, t1.ticketCode); assert(dup.admittedBy);
  // a void ticket's QR is refused
  await p.ticket.update({ where: { id: t2.id }, data: { status: 'void' } });
  const v: any = await checkInTicket(null, { tokenOrCode: ticketToken(t2.ticketCode), showId: a.s.id, method: 'scan', idempotencyKey: k() }, staff); assert.equal(v.result, 'void');
  // a forged token is not found
  await assert.rejects(checkInTicket(null, { tokenOrCode: 'f'.repeat(64), showId: a.s.id, method: 'scan', idempotencyKey: k() }, staff), /Ticket not found/);
  assert.equal(await p.checkIn.count({ where: { ticketId: t1.id, result: 'admitted' } }), 1);
  console.log('PASS ticket QR: payload is the scan token; admitted once by token and named', t1.ticketCode, '; wrong show, duplicate, void and forged refused');
} finally {
  if (shows.length) await p.show.updateMany({ where: { id: { in: shows } }, data: { status: 'cancelled' } });
  await p.$disconnect();
} }
main().catch((e) => { console.error(e); process.exit(1); });
