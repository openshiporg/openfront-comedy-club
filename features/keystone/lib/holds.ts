import { heldByTier } from './groupHold';

/** Seat counts a hold is holding, per tier. Reads the hold's lines when the caller did not load them. */
export async function holdSeats(tx: any, hold: any) {
  const lines = Array.isArray(hold.lines) ? hold.lines : await tx.inventoryHoldLine.findMany({ where: { hold: { id: hold.id } } });
  return heldByTier(hold, lines.map((l: any) => ({ priceTierId: l.priceTierId ?? l.priceTier?.id ?? null, quantity: l.quantity })));
}

/** Give a hold's seats back to every tier it touched. One call releases the whole party. */
export async function releaseHoldSeats(tx: any, hold: any) {
  for (const s of await holdSeats(tx, hold)) await tx.priceTier.update({ where: { id: s.tierId }, data: { held: { decrement: s.quantity } } });
}
