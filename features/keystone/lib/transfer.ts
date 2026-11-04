export const MAX_TRANSFERS_PER_ORDER = 10;

export type TransferInput = {
  ticketStatus: string; orderStatus: string; showStatus: string; doorsAt: Date | null; startsAt: Date; now: Date;
  current: { name: string; email: string }; next: { name: string; email: string }; transfersInOrder: number;
};
export type TransferDecision = { ok: true } | { ok: false; reason: string };

export const normalizeHolder = (h: { name: string; email: string }) => ({ name: String(h.name || '').trim().replace(/\s+/g, ' '), email: String(h.email || '').trim().toLowerCase() });

/** One rule for every caller: a valid ticket on a live, paid order can change hands until doors open. */
export function transferDecision(i: TransferInput): TransferDecision {
  const next = normalizeHolder(i.next), cur = normalizeHolder(i.current);
  if (!next.name || next.name.length > 120) return { ok: false, reason: 'Enter the name of the new holder' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.email) || next.email.length > 200) return { ok: false, reason: 'Enter a valid email for the new holder' };
  if (i.ticketStatus === 'checked_in') return { ok: false, reason: 'This ticket has already been scanned in and cannot be transferred' };
  if (i.ticketStatus !== 'valid') return { ok: false, reason: 'Only a valid ticket can be transferred' };
  if (!['paid', 'partially_refunded', 'comp'].includes(i.orderStatus)) return { ok: false, reason: 'This order is not eligible for transfer' };
  if (['cancelled', 'completed', 'settled'].includes(i.showStatus)) return { ok: false, reason: 'This show is closed to transfers' };
  const cutoff = i.doorsAt || i.startsAt;
  if (i.now >= cutoff) return { ok: false, reason: 'Transfers close when doors open' };
  if (next.name.toLowerCase() === cur.name.toLowerCase() && next.email === cur.email) return { ok: false, reason: 'That is already the ticket holder' };
  if (i.transfersInOrder >= MAX_TRANSFERS_PER_ORDER) return { ok: false, reason: 'This order has reached its transfer limit; contact the venue' };
  return { ok: true };
}

export function transferMessage(next: { name: string }, show: { title: string; startsAt: Date }, ticketCode: string, link: string, from: string, when: string) {
  return {
    subject: `A ticket for ${show.title} was transferred to you`,
    body: `Hi ${next.name}, ${from || 'a friend'} transferred a ticket for ${show.title} (${when}) to you. Your ticket code is ${ticketCode}. Open your ticket here and show it at the door: ${link}\nThe previous ticket no longer works.`,
  };
}

export type HolderView = { ticketCode: string; status: string; holderName: string; transferredTo: boolean; history: { name: string; at: Date | null }[] };

/** Earlier holders, oldest first, names only. `chain` runs oldest to newest and ends with the ticket being viewed; an entry's time is when the NEXT ticket was issued, i.e. the hand-off. */
export function buildHistory(chain: { holderName: string; createdAt: Date | null }[]) {
  return chain.slice(0, -1).map((t, i) => ({ name: t.holderName || 'Original buyer', at: chain[i + 1].createdAt }));
}

/** What a ticket page may reveal for a given ticket state. Void tickets only ever say they were transferred. */
export function holderAccess(ticket: { status: string }, hasSuccessor: boolean): 'full' | 'transferred' | 'refused' {
  if (ticket.status === 'void') return hasSuccessor ? 'transferred' : 'refused';
  return 'full';
}
