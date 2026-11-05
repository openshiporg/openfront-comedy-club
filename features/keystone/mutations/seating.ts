import { audit, command, lockTransactionKey, requirePermission } from '../lib/commands';

const LIVE_SHOW = ['on_sale', 'sold_out', 'doors_open', 'in_progress'];

async function loadSeated(tx: any, assignmentId: string) {
  const s = await tx.seatingAssignment.findUnique({ where: { id: assignmentId }, include: { tables: { include: { section: true } }, show: true, checks: { where: { status: { in: ['open', 'presented'] } }, select: { id: true } }, occupancies: { where: { occupancyKey: { not: null } } } } });
  if (!s || s.status !== 'seated') throw new Error('This party is not seated');
  if (!LIVE_SHOW.includes(s.show.status)) throw new Error('The show is not live');
  return s;
}

/**
 * Moves a seated party to other tables of the same room. The new tables must be free (or held for this party's own order) and seat the party;
 * the old ones are freed. An open check follows the party because it belongs to the seating, not to a table.
 */
export async function moveParty(_: any, a: any, c: any) {
  requirePermission(c, 'canManageDoor');
  return command(c, 'moveParty', a, async tx => {
    const first = await tx.seatingAssignment.findUnique({ where: { id: String(a.assignmentId || '') }, select: { showId: true } });
    if (!first) throw new Error('This party is not seated');
    await lockTransactionKey(tx, 'show:' + first.showId);
    const s = await loadSeated(tx, a.assignmentId);
    const ids = [...new Set<string>(a.tableIds || [])];
    if (!ids.length) throw new Error('Choose tables');
    const same = ids.length === s.tables.length && ids.every((id) => s.tables.some((t: any) => t.id === id));
    if (same) throw new Error('The party is already at these tables');
    const tables = await tx.table.findMany({ where: { id: { in: ids } }, include: { section: true } });
    if (tables.length !== ids.length || tables.some((t: any) => t.section.roomId !== s.show.roomId)) throw new Error('Choose tables in this room');
    if (tables.reduce((n: number, t: any) => n + t.seats, 0) < (s.partySize || 1)) throw new Error('Not enough seats for the party');
    const order = s.ticketOrderId ? await tx.ticketOrder.findUnique({ where: { id: s.ticketOrderId }, include: { hold: true } }) : null;
    for (const t of tables) {
      const occ = await tx.tableOccupancy.findUnique({ where: { occupancyKey: s.showId + ':' + t.id } });
      if (occ && occ.assignmentId !== s.id && !(order?.hold && occ.holdId === order.hold.id)) throw new Error(`Table ${t.label} is taken`);
    }
    const before = { tables: s.tables.map((t: any) => t.label) };
    // free the old tables first: a party moving onto part of its own tables keeps them
    await tx.tableOccupancy.updateMany({ where: { assignmentId: s.id, occupancyKey: { not: null } }, data: { occupancyKey: null } });
    for (const t of tables) {
      const key = s.showId + ':' + t.id;
      const occ = await tx.tableOccupancy.findUnique({ where: { occupancyKey: key } });
      if (occ) await tx.tableOccupancy.update({ where: { id: occ.id }, data: { assignmentId: s.id } });
      else await tx.tableOccupancy.create({ data: { occupancyKey: key, showId: s.showId, tableId: t.id, assignmentId: s.id } });
    }
    await tx.seatingAssignment.update({ where: { id: s.id }, data: { tables: { set: ids.map((id) => ({ id })) } } });
    const after = { tables: tables.map((t: any) => t.label) };
    await audit(tx, c, 'moved', 'SeatingAssignment', s.id, before, after, String(a.reason || ''));
    return { assignmentId: s.id, ...after };
  });
}

/**
 * Unseats a party that was seated by mistake or left without ordering: the tables are freed and the party waits to be seated again.
 * Refused while the party has an open check, so a bar tab is never orphaned; close or void the check first. A voided check does not block it.
 */
export async function unseatParty(_: any, a: any, c: any) {
  requirePermission(c, 'canManageDoor');
  return command(c, 'unseatParty', a, async tx => {
    const first = await tx.seatingAssignment.findUnique({ where: { id: String(a.assignmentId || '') }, select: { showId: true } });
    if (!first) throw new Error('This party is not seated');
    await lockTransactionKey(tx, 'show:' + first.showId);
    const s = await loadSeated(tx, a.assignmentId);
    if (s.checks.length) throw new Error('This party has an open check. Close it first');
    const paid = await tx.check.count({ where: { seatingAssignmentId: s.id, status: 'paid' } });
    if (paid) throw new Error('This party already paid a check. Their table is freed when the check closes');
    await tx.tableOccupancy.updateMany({ where: { assignmentId: s.id, occupancyKey: { not: null } }, data: { occupancyKey: null } });
    // the row stays as history (unseated, no tables); the order is detached so it is back on the waiting list
    await tx.seatingAssignment.update({ where: { id: s.id }, data: { status: 'unseated', ticketOrder: { disconnect: true }, tables: { set: [] } } });
    await audit(tx, c, 'unseated', 'SeatingAssignment', s.id, { tables: s.tables.map((t: any) => t.label), partySize: s.partySize, orderId: s.ticketOrderId }, { status: 'unseated' }, String(a.reason || ''));
    return { unseated: true, orderId: s.ticketOrderId };
  });
}
