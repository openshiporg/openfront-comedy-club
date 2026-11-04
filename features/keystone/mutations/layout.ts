import { audit, command, lockTransactionKey, requirePermission } from '../lib/commands';
import { capacityBlock, layoutCapacity, normalizeChange, removeTableBlock, sameLabel, tableEditBlock, type LayoutChange } from '../lib/layout';

const DONE = ['cancelled', 'completed', 'settled'];
const MAX_CHANGES = 60;
class Rollback extends Error { constructor(public result: any) { super('rollback'); } }

async function liveUse(tx: any, tableId: string) {
  const live = { status: { notIn: DONE } };
  const [occ, holds, assigns, histOcc, histHolds, histAssigns] = await Promise.all([
    tx.tableOccupancy.findMany({ where: { tableId, occupancyKey: { not: null }, show: live }, select: { show: { select: { title: true } } } }),
    tx.inventoryHold.findMany({ where: { tables: { some: { id: tableId } }, status: 'active', show: live }, select: { show: { select: { title: true } } } }),
    tx.seatingAssignment.findMany({ where: { tables: { some: { id: tableId } }, status: { not: 'closed' }, show: live }, select: { show: { select: { title: true } } } }),
    tx.tableOccupancy.count({ where: { tableId } }),
    tx.inventoryHold.count({ where: { tables: { some: { id: tableId } } } }),
    tx.seatingAssignment.count({ where: { tables: { some: { id: tableId } } } }),
  ]);
  const liveShows = [...new Set([...occ, ...holds, ...assigns].map((r: any) => r.show?.title || 'a show'))] as string[];
  return { liveShows, history: histOcc + histHolds + histAssigns };
}

async function apply(tx: any, c: any, roomId: string, changes: LayoutChange[]) {
  const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true, name: true, seatingMode: true, capacity: true } });
  if (!room) throw new Error('Room not found');
  if (room.seatingMode !== 'tables') throw new Error(`${room.name} is general admission; it has no tables to edit`);
  const liveShows = await tx.show.findMany({ where: { roomId, status: { notIn: DONE } }, select: { id: true, title: true } });
  for (const s of [...liveShows].sort((a: any, b: any) => a.id.localeCompare(b.id))) await lockTransactionKey(tx, 'show:' + s.id);

  const inRoom = async (sectionId: string) => {
    const s = await tx.section.findUnique({ where: { id: sectionId }, include: { tables: { select: { id: true } } } });
    if (!s || s.roomId !== roomId) throw new Error('Section is not in this room');
    return s;
  };
  const tableInRoom = async (tableId: string) => {
    const t = await tx.table.findUnique({ where: { id: tableId }, include: { section: true } });
    if (!t || t.section?.roomId !== roomId) throw new Error('Table is not in this room');
    return t;
  };
  const labelFree = async (label: string, exceptId?: string) => {
    const all = await tx.table.findMany({ where: { section: { roomId }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { label: true } });
    if (all.some((t: any) => sameLabel(t.label, label))) throw new Error(`Table label ${label} is already used in this room`);
  };
  const tableTierUse = async (name: string) => tx.priceTier.count({ where: { isTableTier: true, name, show: { roomId, status: { notIn: DONE } } } });

  const summary: string[] = [];
  for (const ch of changes) {
    if (ch.kind === 'addSection') {
      if ((await tx.section.count({ where: { roomId, name: { equals: ch.name, mode: 'insensitive' } } }))) throw new Error(`Section ${ch.name} already exists`);
      const sort = (await tx.section.aggregate({ where: { roomId }, _max: { sort: true } }))._max.sort ?? 0;
      await tx.section.create({ data: { name: ch.name, sort: sort + 1, room: { connect: { id: roomId } } } });
      summary.push(`Add section ${ch.name}`);
    } else if (ch.kind === 'renameSection') {
      const s = await inRoom(ch.sectionId);
      if (s.name === ch.name) continue;
      if ((await tx.section.count({ where: { roomId, id: { not: s.id }, name: { equals: ch.name, mode: 'insensitive' } } }))) throw new Error(`Section ${ch.name} already exists`);
      if (await tableTierUse(s.name)) throw new Error(`Section ${s.name} is sold as a table ticket type on a live show, so it cannot be renamed now`);
      await tx.section.update({ where: { id: s.id }, data: { name: ch.name } });
      summary.push(`Rename section ${s.name} to ${ch.name}`);
    } else if (ch.kind === 'removeSection') {
      const s = await inRoom(ch.sectionId);
      if (s.tables.length) throw new Error(`Section ${s.name} still has ${s.tables.length} table${s.tables.length === 1 ? '' : 's'}; remove them first`);
      if (await tableTierUse(s.name)) throw new Error(`Section ${s.name} is sold as a table ticket type on a live show, so it cannot be removed now`);
      await tx.section.delete({ where: { id: s.id } });
      summary.push(`Remove section ${s.name}`);
    } else if (ch.kind === 'addTable') {
      const s = await inRoom(ch.sectionId);
      await labelFree(ch.label);
      await tx.table.create({ data: { label: ch.label, seats: ch.seats, shape: ch.shape, x: ch.x, y: ch.y, section: { connect: { id: s.id } } } });
      summary.push(`Add table ${ch.label} (${ch.seats} seats) to ${s.name}`);
    } else if (ch.kind === 'updateTable') {
      const t = await tableInRoom(ch.tableId);
      if (ch.sectionId) await inRoom(ch.sectionId);
      if (ch.label !== undefined && !sameLabel(ch.label, t.label)) await labelFree(ch.label, t.id);
      const block = tableEditBlock(t.label, await liveUse(tx, t.id), { seats: t.seats ?? 0, sectionId: t.sectionId }, { seats: ch.seats, sectionId: ch.sectionId });
      if (block) throw new Error(block);
      const data: any = {};
      if (ch.label !== undefined) data.label = ch.label;
      if (ch.seats !== undefined) data.seats = ch.seats;
      if (ch.shape !== undefined) data.shape = ch.shape;
      if (ch.x !== undefined) data.x = ch.x;
      if (ch.y !== undefined) data.y = ch.y;
      if (ch.sectionId !== undefined) data.section = { connect: { id: ch.sectionId } };
      await tx.table.update({ where: { id: t.id }, data });
      summary.push(`Change table ${t.label}`);
    } else if (ch.kind === 'removeTable') {
      const t = await tableInRoom(ch.tableId);
      const block = removeTableBlock(t.label, await liveUse(tx, t.id));
      if (block) throw new Error(block);
      await tx.table.update({ where: { id: t.id }, data: { combinableWith: { set: [] }, combinedBy: { set: [] } } });
      await tx.table.delete({ where: { id: t.id } });
      summary.push(`Remove table ${t.label}`);
    }
  }
  const tables = await tx.table.findMany({ where: { section: { roomId } }, select: { seats: true } });
  const capacity = layoutCapacity(tables);
  if (capacity < 1) throw new Error('A room needs at least one seat');
  if (capacity < room.capacity) {
    const counts = await Promise.all(liveShows.map(async (s: any) => ({ title: s.title,
      sold: await tx.ticket.count({ where: { showId: s.id, status: { in: ['valid', 'checked_in'] } } }),
      held: (await tx.inventoryHold.aggregate({ where: { showId: s.id, status: 'active' }, _sum: { quantity: true } }))._sum.quantity || 0 })));
    const cb = capacityBlock(capacity, counts);
    if (cb) throw new Error(cb);
  }
  if (capacity !== room.capacity) await tx.room.update({ where: { id: roomId }, data: { capacity } });
  return { room: room.name, changes: summary, tables: tables.length, capacityBefore: room.capacity, capacityAfter: capacity };
}

function parse(a: any) {
  const list = Array.isArray(a.changes) ? a.changes : [];
  if (!list.length) throw new Error('No changes to apply');
  if (list.length > MAX_CHANGES) throw new Error(`At most ${MAX_CHANGES} changes at a time`);
  return list.map(normalizeChange);
}

/** Read-only: runs the real changes in a transaction and rolls it back, so the preview can never disagree with the apply. */
export async function previewRoomLayout(_: any, a: any, c: any) {
  requirePermission(c, 'canManageSettings');
  const changes = parse(a);
  try {
    await c.prisma.$transaction(async (tx: any) => { await lockTransactionKey(tx, 'room:' + a.roomId); throw new Rollback(await apply(tx, c, String(a.roomId || ''), changes)); }, { timeout: 20000 });
  } catch (e: any) { if (e instanceof Rollback) return e.result; throw e; }
}

/** All-or-nothing, idempotent, audited. Refuses anything that would strand a hold, a sold table or a seated party. */
export async function editRoomLayout(_: any, a: any, c: any) {
  requirePermission(c, 'canManageSettings');
  const changes = parse(a);
  return command(c, 'editRoomLayout', a, async tx => {
    const result = await apply(tx, c, String(a.roomId || ''), changes);
    await audit(tx, c, 'room_layout_edited', 'Room', String(a.roomId), { capacity: result.capacityBefore }, { capacity: result.capacityAfter, tables: result.tables, changes: result.changes }, String(a.reason || ''));
    return result;
  }, 'room:' + a.roomId);
}
