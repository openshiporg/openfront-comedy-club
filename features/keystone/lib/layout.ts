/** Pure rules for editing a room's floor plan. The database facts (what is live on a table) are gathered by the command; the decisions are here. */

export const SHAPES = ['round', 'square', 'rectangle'] as const;
export type Shape = (typeof SHAPES)[number];
export const MAX_SEATS = 24;
export const MAX_COORD = 2000;

export type LayoutChange =
  | { kind: 'addSection'; name: string }
  | { kind: 'renameSection'; sectionId: string; name: string }
  | { kind: 'removeSection'; sectionId: string }
  | { kind: 'addTable'; sectionId: string; label: string; seats: number; shape: Shape; x: number; y: number }
  | { kind: 'updateTable'; tableId: string; sectionId?: string; label?: string; seats?: number; shape?: Shape; x?: number; y?: number }
  | { kind: 'removeTable'; tableId: string };

const int = (v: unknown, name: string, min: number, max: number) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  return n;
};
const text = (v: unknown, name: string, max: number) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!s) throw new Error(`${name} is required`);
  if (s.length > max) throw new Error(`${name} must be ${max} characters or fewer`);
  return s;
};
const id = (v: unknown, name: string) => { const s = String(v ?? '').trim(); if (!s) throw new Error(`${name} is required`); return s; };
const shape = (v: unknown): Shape => { if (!SHAPES.includes(v as Shape)) throw new Error('Shape must be round, square or rectangle'); return v as Shape; };

/** Clean and validate one requested change; throws a plain message on anything unusable. */
export function normalizeChange(raw: any): LayoutChange {
  const r = raw && typeof raw === 'object' ? raw : {};
  switch (r.kind) {
    case 'addSection': return { kind: 'addSection', name: text(r.name, 'Section name', 40) };
    case 'renameSection': return { kind: 'renameSection', sectionId: id(r.sectionId, 'Section'), name: text(r.name, 'Section name', 40) };
    case 'removeSection': return { kind: 'removeSection', sectionId: id(r.sectionId, 'Section') };
    case 'addTable': return { kind: 'addTable', sectionId: id(r.sectionId, 'Section'), label: text(r.label, 'Table label', 20), seats: int(r.seats, 'Seats', 1, MAX_SEATS), shape: shape(r.shape ?? 'round'), x: int(r.x ?? 0, 'X', 0, MAX_COORD), y: int(r.y ?? 0, 'Y', 0, MAX_COORD) };
    case 'updateTable': {
      const out: any = { kind: 'updateTable', tableId: id(r.tableId, 'Table') };
      if (r.sectionId !== undefined) out.sectionId = id(r.sectionId, 'Section');
      if (r.label !== undefined) out.label = text(r.label, 'Table label', 20);
      if (r.seats !== undefined) out.seats = int(r.seats, 'Seats', 1, MAX_SEATS);
      if (r.shape !== undefined) out.shape = shape(r.shape);
      if (r.x !== undefined) out.x = int(r.x, 'X', 0, MAX_COORD);
      if (r.y !== undefined) out.y = int(r.y, 'Y', 0, MAX_COORD);
      if (Object.keys(out).length === 2) throw new Error('Nothing to change');
      return out;
    }
    case 'removeTable': return { kind: 'removeTable', tableId: id(r.tableId, 'Table') };
    default: throw new Error('Unknown layout change');
  }
}

export type TableUse = { liveShows: string[]; history: number }; // live shows with a hold, seat assignment or occupancy on the table; past bookings of any kind
const where = (u: TableUse) => `${u.liveShows.slice(0, 3).join(', ')}${u.liveShows.length > 3 ? ` and ${u.liveShows.length - 3} more` : ''}`;

/** Why a table cannot be removed, or null. Live seating blocks it; so does any booking history, because deleting the table would erase where past guests sat. */
export function removeTableBlock(label: string, use: TableUse): string | null {
  if (use.liveShows.length) return `Table ${label} is held, sold or seated for ${where(use)}. Cancel or move those first.`;
  if (use.history > 0) return `Table ${label} has ${use.history} past booking${use.history === 1 ? '' : 's'} on record, so it cannot be deleted. Rename it or leave it in place.`;
  return null;
}

/** Seat count, section and capacity-defining edits are blocked while the table is in use, because ticket quantity must equal the table's seats. */
export function tableEditBlock(label: string, use: TableUse, current: { seats: number; sectionId: string }, change: { seats?: number; sectionId?: string }): string | null {
  const resizing = change.seats !== undefined && change.seats !== current.seats;
  const moving = change.sectionId !== undefined && change.sectionId !== current.sectionId;
  if ((resizing || moving) && use.liveShows.length) return `Table ${label} is held, sold or seated for ${where(use)}, so its seats and section cannot change now.`;
  return null;
}

/** Room capacity follows the tables: the sum of every table's seats. */
export const layoutCapacity = (tables: { seats: number | null }[]) => tables.reduce((n, t) => n + (t.seats || 0), 0);

/** Lowering room capacity below what a live show has already sold or held would oversell it. */
export function capacityBlock(newCapacity: number, shows: { title: string; sold: number; held: number }[]): string | null {
  const bad = shows.filter((s) => s.sold + s.held > newCapacity);
  return bad.length ? `That leaves ${newCapacity} seats, but ${bad[0].title} has ${bad[0].sold + bad[0].held} sold or held.` : null;
}

/** The sections a duplicate label check cares about: case-insensitive, whitespace-collapsed, unique across the room. */
export const sameLabel = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();
