import crypto from 'node:crypto';
import { audit, command, hash, lockTransactionKey, requirePermission, transition } from '../lib/commands';
import { checkSlotLink, RESPONSES, slotLinkExpiry, slotTerms } from '../lib/slotLink';

const FLOW: Record<string, string[]> = { offered: ['confirmed', 'declined'] };
const GONE = ['settled', 'cancelled'];

/** Operator: mint a fresh link for an offered slot. A new link replaces the old one, which stops working. */
export async function issueSlotLink(_: any, a: any, c: any) {
  requirePermission(c, 'canManageTalent');
  return command(c, 'issueSlotLink', a, async tx => {
    const first = await tx.lineupSlot.findUnique({ where: { id: a.slotId } }); if (!first) throw new Error('Slot not found');
    await lockTransactionKey(tx, 'show:' + first.showId);
    const slot = await tx.lineupSlot.findUnique({ where: { id: a.slotId }, include: { show: true, comedian: true } });
    if (!slot || slot.status !== 'offered') throw new Error('Only an offered slot can be sent for a response');
    if (GONE.includes(slot.show.status) || slot.show.startsAt <= new Date()) throw new Error('Show is closed to lineup changes');
    if (!slot.comedian?.email) throw new Error('This comedian has no email on file');
    const token = crypto.randomBytes(32).toString('hex'), now = new Date(), expires = slotLinkExpiry(now, slot.show.startsAt);
    await tx.lineupSlot.update({ where: { id: slot.id }, data: { responseTokenHash: hash(token), responseTokenExpiresAt: expires } });
    const link = `${process.env.STOREFRONT_URL || ''}/lineup/respond?slot=${slot.id}#${token}`;
    await audit(tx, c, 'response_link_issued', 'LineupSlot', slot.id, null, { expiresAt: expires });
    return { slotId: slot.id, expiresAt: expires, link };
  }, 'show-slot:' + a.slotId);
}

async function load(db: any, a: any) {
  const slot = await db.lineupSlot.findUnique({ where: { id: String(a.slotId || '') }, include: { show: { select: { title: true, startsAt: true, doorsAt: true, status: true, room: { select: { name: true } } } }, comedian: { select: { stageName: true } } } });
  const check = checkSlotLink(slot, hash(String(a.token || '')), new Date());
  if (!check.ok) throw new Error(check.reason === 'expired' ? 'This link has expired. Ask the venue for a new one.' : 'Not found');
  return slot;
}

/** Public: the comedian reads the terms of their slot. Proof is the link token. */
export async function slotInvite(_: any, a: any, c: any) {
  const slot = await load(c.prisma, a);
  return { slotId: slot.id, comedian: slot.comedian?.stageName || '', title: slot.show.title, startsAt: slot.show.startsAt, doorsAt: slot.show.doorsAt, room: slot.show.room?.name || '', showStatus: slot.show.status, ...slotTerms(slot), canRespond: slot.status === 'offered' && !GONE.includes(slot.show.status) };
}

/** Public: confirm or decline. Same transition and audit as the operator path, plus a note that it came from the link. */
export async function respondToSlot(_: any, a: any, c: any) {
  const next = RESPONSES[String(a.response)]; if (!next) throw new Error('Choose confirm or decline');
  const anon = { ...c, session: null };
  return command(anon, 'respondToSlot', { ...a, token: undefined, tokenHash: hash(String(a.token || '')) }, async tx => {
    const first = await tx.lineupSlot.findUnique({ where: { id: String(a.slotId || '') } });
    if (!first) throw new Error('Not found');
    await lockTransactionKey(tx, 'show:' + first.showId);
    const slot = await load(tx, a);
    if (GONE.includes(slot.show.status)) throw new Error('This show is closed to lineup changes');
    if (slot.status === next) return { status: slot.status, changed: false };
    if (slot.status !== 'offered') throw new Error('This slot has already been answered. Contact the venue to change it.');
    await transition(tx, anon, 'lineupSlot', slot.id, next, FLOW);
    if (next === 'confirmed') { await tx.lineupSlot.update({ where: { id: slot.id }, data: { confirmedAt: new Date() } }); }
    await audit(tx, anon, 'responded_via_link', 'LineupSlot', slot.id, { status: 'offered' }, { status: next }, 'Comedian response via link');
    return { status: next, changed: true };
  });
}
