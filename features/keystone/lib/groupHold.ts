import { basisPoints, cents, quote } from './money';

/** One hold may span several ticket types for a party. These are the pure rules; the mutations apply them under the show lock. */
export const MAX_SINGLE_HOLD = 20;
export const MAX_GROUP_HOLD = 40;
export const MAX_GROUP_LINES = 6;

export type HoldLineInput = { tierId: string; quantity: number; tableIds?: string[] };
export type TierState = { id: string; showId: string; status: string; capacity: number; sold: number; held: number; isTableTier?: boolean; name?: string };

/** Accept the old single-tier arguments or a `lines` list; always return a list. */
export function normalizeLines(input: { tierId?: string; quantity?: number; tableIds?: string[]; lines?: HoldLineInput[] }): HoldLineInput[] {
  if (Array.isArray(input.lines) && input.lines.length) return input.lines.map((l) => ({ tierId: String(l.tierId), quantity: l.quantity, tableIds: l.tableIds }));
  return [{ tierId: String(input.tierId), quantity: input.quantity as number, tableIds: input.tableIds }];
}

/** Shape and size checks before anything is read from the database. */
export function checkLines(lines: HoldLineInput[]): { total: number } {
  if (!lines.length) throw new Error('Choose tickets');
  if (lines.length > MAX_GROUP_LINES) throw new Error(`Choose at most ${MAX_GROUP_LINES} ticket types`);
  if (new Set(lines.map((l) => l.tierId)).size !== lines.length) throw new Error('Each ticket type can appear once');
  for (const l of lines) if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error('Choose at least one ticket of each type');
  const total = lines.reduce((n, l) => n + l.quantity, 0);
  if (lines.length === 1 ? total > MAX_SINGLE_HOLD : total > MAX_GROUP_HOLD) throw new Error(lines.length === 1 ? 'Choose 1–20 tickets' : `A group hold is limited to ${MAX_GROUP_HOLD} tickets`);
  return { total };
}

/** Every line must fit its own tier, and the whole party must fit what the show has left. All or nothing. */
export function checkCapacity(lines: HoldLineInput[], tiers: TierState[], showId: string, showRemaining: number) {
  for (const l of lines) {
    const t = tiers.find((x) => x.id === l.tierId);
    if (!t || t.showId !== showId || t.status !== 'on_sale') throw new Error('Tickets unavailable');
    if (t.sold + t.held + l.quantity > t.capacity) throw new Error(`Not enough capacity in ${t.name || 'that ticket type'}`);
  }
  const total = lines.reduce((n, l) => n + l.quantity, 0);
  if (total > showRemaining) throw new Error('Not enough capacity');
}

export type PriceLine = { priceCents: number; feeCents: number; quantity: number };

/**
 * Quote for a party across tiers. With one line and an optional promotion this is exactly `quote()`;
 * promotions are not combined with several ticket types (one fixed-amount discount cannot be split fairly).
 */
export function quoteGroup(lines: PriceLine[], serviceFeeBps: number, taxBps: number, promo?: { discountType?: string; discountValue?: number; perOrderLimit?: number } | null) {
  if (!lines.length) throw new Error('Quantity required');
  if (lines.length === 1) return quote({ ...lines[0], serviceFeeBps, taxBps, discountType: promo?.discountType, discountValue: promo?.discountValue, perOrderLimit: promo?.perOrderLimit });
  if (promo) throw new Error('Promotions cannot be combined with several ticket types');
  for (const l of lines) { cents(l.priceCents); cents(l.feeCents); if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error('Quantity required'); }
  const subtotalCents = cents(lines.reduce((n, l) => n + l.priceCents * l.quantity, 0));
  const feesCents = cents(lines.reduce((n, l) => n + l.feeCents * l.quantity, 0) + basisPoints(subtotalCents, serviceFeeBps));
  const taxCents = basisPoints(subtotalCents, taxBps);
  return { subtotalCents, feesCents, discountCents: 0, taxCents, totalCents: cents(subtotalCents + feesCents + taxCents) };
}

/** Per-line cents for the order lines: subtotal exact, tax split by share with the remainder on the last line so lines add up to the order. */
export function splitTax(lines: PriceLine[], taxCents: number) {
  const subs = lines.map((l) => l.priceCents * l.quantity); const sum = subs.reduce((a, b) => a + b, 0);
  let left = taxCents;
  return lines.map((_, i) => { const t = i === lines.length - 1 ? left : sum ? Math.floor((taxCents * subs[i]) / sum) : 0; left -= t; return { subtotalCents: subs[i], taxCents: t }; });
}

/** The seat counts a hold is holding, per tier. Older single-tier holds have no lines, so fall back to the hold itself. */
export function heldByTier(hold: { priceTierId?: string | null; quantity?: number | null }, lines: { priceTierId?: string | null; quantity: number | null }[]): { tierId: string; quantity: number }[] {
  if (lines.length) return lines.map((l) => ({ tierId: l.priceTierId as string, quantity: l.quantity || 0 }));
  return hold.priceTierId ? [{ tierId: hold.priceTierId, quantity: hold.quantity || 0 }] : [];
}

/** Default partial-refund amount: the share of the order total carried by the chosen tickets, weighted by each ticket's own price. */
export function refundShare(totalCents: number, chosen: { priceCents: number }[], all: { priceCents: number }[]): number {
  const weight = (xs: { priceCents: number }[]) => xs.reduce((n, x) => n + x.priceCents, 0);
  const denom = weight(all);
  if (!all.length) return 0;
  if (denom <= 0) return Math.floor((totalCents * chosen.length) / all.length);
  return Math.floor((totalCents * weight(chosen)) / denom);
}
