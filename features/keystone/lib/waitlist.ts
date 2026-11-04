import { saleState } from './saleWindow';

export const OFFER_MINUTES = 120;
type Tier = { id: string; priceCents: number; capacity: number; sold: number; held: number; status: string; isTableTier?: boolean; salesStartAt?: Date | null; salesEndAt?: Date | null };
type Entry = { id: string; partySize: number; createdAt: Date };

/** Offer expiry: the standard window, never past the start of the show. */
export function offerExpiry(now: Date, showStartsAt: Date, minutes = OFFER_MINUTES) {
  const at = new Date(Math.min(now.getTime() + minutes * 60000, showStartsAt.getTime()));
  return at.getTime() > now.getTime() ? at : null;
}

/** The cheapest general-admission tier a party of this size can buy right now, or null. */
export function tierFor(size: number, tiers: Tier[], showRemaining: number, now: Date) {
  if (size > showRemaining) return null;
  return [...tiers].sort((a, b) => a.priceCents - b.priceCents)
    .find((t) => !t.isTableTier && t.status === 'on_sale' && saleState({ salesStartAt: t.salesStartAt, salesEndAt: t.salesEndAt }, now) === 'open' && t.sold + t.held + size <= t.capacity) || null;
}

/**
 * First come, first served. Walks the line in join order and offers each party that fits; a party
 * too big for the room left is skipped, not allowed to block smaller parties behind it.
 */
export function planOffers(entries: Entry[], tiers: Tier[], showRemaining: number, now: Date) {
  const offers: { entryId: string; tierId: string; quantity: number }[] = [];
  const live = tiers.map((t) => ({ ...t })); let left = showRemaining;
  for (const e of [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    const t = tierFor(e.partySize, live, left, now); if (!t) continue;
    t.held += e.partySize; left -= e.partySize; offers.push({ entryId: e.id, tierId: t.id, quantity: e.partySize });
  }
  return offers;
}
