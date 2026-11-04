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
export type Promo = { discountType?: string; discountValue?: number; perOrderLimit?: number };
export type LineQuote = { subtotalCents: number; discountCents: number; taxCents: number };

/** Split `total` across weights, rounding down; the remainder goes to the last line that can still take it (`caps`). */
export function allocate(total: number, weights: number[], caps: number[]): number[] {
  cents(total); const sum = weights.reduce((a, b) => a + b, 0);
  if (total === 0 || sum === 0) return weights.map(() => 0);
  const out = weights.map((w, i) => Math.min(caps[i], Math.floor((total * w) / sum)));
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let i = out.length - 1; i >= 0 && left > 0; i--) { const room = Math.min(left, caps[i] - out[i]); out[i] += room; left -= room; }
  if (left !== 0) throw new Error('Discount could not be allocated');
  return out;
}

/**
 * Quote for a party across tiers. One line is exactly `quote()`. With several lines the promotion is worked out once on the
 * whole party (the same per-order unit limit, applied to the cheapest units so a limit never over-discounts), then split across
 * lines pro rata by line subtotal. Tax is charged on the discounted amount and split by each line's net.
 */
export function quoteGroup(lines: PriceLine[], serviceFeeBps: number, taxBps: number, promo?: Promo | null) {
  if (!lines.length) throw new Error('Quantity required');
  if (lines.length === 1) {
    const q = quote({ ...lines[0], serviceFeeBps, taxBps, discountType: promo?.discountType, discountValue: promo?.discountValue, perOrderLimit: promo?.perOrderLimit });
    return { ...q, lines: [{ subtotalCents: q.subtotalCents, discountCents: q.discountCents, taxCents: q.taxCents }] as LineQuote[] };
  }
  for (const l of lines) { cents(l.priceCents); cents(l.feeCents); if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error('Quantity required'); }
  const subs = lines.map((l) => l.priceCents * l.quantity);
  const subtotalCents = cents(subs.reduce((n, v) => n + v, 0));
  const feesCents = cents(lines.reduce((n, l) => n + l.feeCents * l.quantity, 0) + basisPoints(subtotalCents, serviceFeeBps));
  const units = lines.flatMap((l) => Array<number>(l.quantity).fill(l.priceCents)).sort((a, b) => a - b);
  const limit = promo?.perOrderLimit;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('Positive promotion limit required');
  const eligibleCents = promo ? cents(units.slice(0, Math.min(units.length, limit ?? units.length)).reduce((a, b) => a + b, 0)) : 0;
  const value = promo?.discountValue || 0; cents(value);
  const discountCents = !promo ? 0 : Math.min(eligibleCents, promo.discountType === 'comp' ? eligibleCents : promo.discountType === 'percent_bps' ? basisPoints(eligibleCents, value) : promo.discountType === 'amount_cents' ? value : 0);
  const discounts = allocate(discountCents, subs, subs);
  const taxCents = basisPoints(subtotalCents - discountCents, taxBps);
  const nets = subs.map((v, i) => v - discounts[i]);
  const taxes = allocate(taxCents, nets, nets.map(() => taxCents));
  return { subtotalCents, feesCents, discountCents, taxCents, totalCents: cents(subtotalCents + feesCents - discountCents + taxCents), lines: subs.map((v, i) => ({ subtotalCents: v, discountCents: discounts[i], taxCents: taxes[i] })) as LineQuote[] };
}

/** The seat counts a hold is holding, per tier. Older single-tier holds have no lines, so fall back to the hold itself. */
export function heldByTier(hold: { priceTierId?: string | null; quantity?: number | null }, lines: { priceTierId?: string | null; quantity: number | null }[]): { tierId: string; quantity: number }[] {
  if (lines.length) return lines.map((l) => ({ tierId: l.priceTierId as string, quantity: l.quantity || 0 }));
  return hold.priceTierId ? [{ tierId: hold.priceTierId, quantity: hold.quantity || 0 }] : [];
}

/** Default partial-refund amount: the share of the order total carried by the chosen tickets, weighted by what each ticket paid (its line net of any discount, per ticket). */
export const ticketWeight = (line: { lineTotalCents?: number | null; discountCents?: number | null; quantity?: number | null; unitPriceCents?: number | null; unitFeeCents?: number | null } | null | undefined) =>
  !line ? 0 : (line.quantity ? Math.round((((line.lineTotalCents ?? 0) - (line.discountCents ?? 0)) * 1000) / line.quantity) : (line.unitPriceCents ?? 0) * 1000) + (line.unitFeeCents ?? 0) * 1000;

export function refundShare(totalCents: number, chosen: { priceCents: number }[], all: { priceCents: number }[]): number {
  const weight = (xs: { priceCents: number }[]) => xs.reduce((n, x) => n + x.priceCents, 0);
  const denom = weight(all);
  if (!all.length) return 0;
  if (denom <= 0) return Math.floor((totalCents * chosen.length) / all.length);
  return Math.floor((totalCents * weight(chosen)) / denom);
}
