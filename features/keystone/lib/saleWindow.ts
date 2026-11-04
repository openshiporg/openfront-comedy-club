export type SaleState = 'open' | 'scheduled' | 'ended' | 'paused' | 'closed';
type Tier = { status?: string; salesStartAt?: Date | string | null; salesEndAt?: Date | string | null };
const ms = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : null);

/** One rule for every caller: a tier sells only while on_sale and inside its optional window. */
export function saleState(tier: Tier, now: Date = new Date()): SaleState {
  if (tier.status === 'paused') return 'paused';
  if (tier.status && tier.status !== 'on_sale') return 'closed';
  const start = ms(tier.salesStartAt), end = ms(tier.salesEndAt), t = now.getTime();
  if (start !== null && t < start) return 'scheduled';
  if (end !== null && t >= end) return 'ended';
  return 'open';
}

export function assertValidWindow(start: Date | null, end: Date | null, showStartsAt: Date) {
  if (start && Number.isNaN(start.getTime())) throw new Error('Invalid on-sale time');
  if (end && Number.isNaN(end.getTime())) throw new Error('Invalid off-sale time');
  if (start && end && end <= start) throw new Error('Off-sale must be after on-sale');
  if (end && end > showStartsAt) throw new Error('Sales cannot end after the show starts');
  if (start && start >= showStartsAt) throw new Error('Sales must start before the show');
}
