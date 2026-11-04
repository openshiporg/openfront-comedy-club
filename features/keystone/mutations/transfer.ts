import { audit, code, command, hash, lockTransactionKey, prove } from '../lib/commands';
import { MAX_TRANSFERS_PER_ORDER, normalizeHolder, transferDecision, transferMessage } from '../lib/transfer';
import { ticketToken } from './checkout';

/**
 * The buyer (proof: order number + order secret) hands one ticket to someone else. The old ticket is voided
 * with a compare-and-set against the same status check-in uses, so a scan and a transfer cannot both win.
 * Seat counts do not change: one valid ticket is replaced by one valid ticket.
 */
export async function transferTicket(_: any, a: any, c: any) {
  const next = normalizeHolder({ name: a.name, email: a.email });
  return command(c, 'transferTicket', { ...a, orderSecret: undefined, proof: hash(String(a.orderSecret || '')) }, async tx => {
    const first = await tx.ticketOrder.findUnique({ where: { orderNumber: String(a.orderNumber || '') } });
    prove(first, String(a.orderSecret || ''), 'secretKey');
    await lockTransactionKey(tx, 'show:' + first.showId);
    const order = await tx.ticketOrder.findUnique({ where: { id: first.id }, include: { show: true, tickets: true } });
    const old = order.tickets.find((t: any) => t.ticketCode === String(a.ticketCode || ''));
    if (!old) throw new Error('Ticket not found');
    const decision = transferDecision({
      ticketStatus: old.status, orderStatus: order.status, showStatus: order.show.status, doorsAt: order.show.doorsAt, startsAt: order.show.startsAt, now: new Date(),
      current: { name: old.holderName || order.name, email: old.holderEmail || order.email }, next,
      transfersInOrder: order.tickets.filter((t: any) => t.transferredFromCode).length,
    });
    if (!decision.ok) throw new Error(decision.reason);
    const moved = await tx.ticket.updateMany({ where: { id: old.id, status: 'valid' }, data: { status: 'void' } });
    if (moved.count !== 1) throw new Error('This ticket has already been scanned in and cannot be transferred');
    const ticketCode = code('T');
    const fresh = await tx.ticket.create({ data: { orderId: order.id, showId: order.showId, lineId: old.lineId, ticketCode, tokenHash: hash(ticketToken(ticketCode)), holderName: next.name, holderEmail: next.email, transferredFromCode: old.ticketCode, status: 'valid' } });
    const msg = transferMessage(next, order.show, ticketCode, ticketToken(ticketCode), old.holderName || order.name, order.show.startsAt.toISOString());
    await tx.notificationRecord.create({ data: { notificationKey: 'ticket_transfer:' + fresh.id, kind: 'ticket_transfer', channel: 'email', status: 'queued', toEmail: next.email, showId: order.showId, sendAfter: new Date(), subject: msg.subject, body: msg.body, payload: { orderId: order.id, ticketId: fresh.id } } });
    await audit(tx, c, 'transferred', 'Ticket', old.id, { status: 'valid', holderName: old.holderName, holderEmail: old.holderEmail, ticketCode: old.ticketCode }, { status: 'void', newTicketId: fresh.id, newTicketCode: ticketCode, holderName: next.name, holderEmail: next.email }, 'Ticket transferred by buyer');
    return { ticketCode, token: ticketToken(ticketCode), holderName: next.name, replacedCode: old.ticketCode, remainingTransfers: MAX_TRANSFERS_PER_ORDER - order.tickets.filter((t: any) => t.transferredFromCode).length - 1 };
  });
}
