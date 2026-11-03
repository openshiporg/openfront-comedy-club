export function cents(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Non-negative integer cents required'); return value; }
export function basisPoints(amount: number, bps: number) { cents(amount); cents(bps); return Math.floor((amount * bps + 5000) / 10000); }
export function quote(input: { priceCents:number; feeCents:number; quantity:number; serviceFeeBps:number; taxBps:number; discountType?:string; discountValue?:number }) {
  for (const n of [input.priceCents,input.feeCents,input.quantity,input.serviceFeeBps,input.taxBps,input.discountValue || 0]) cents(n);
  if (input.quantity < 1) throw new Error('Quantity required');
  const subtotalCents = cents(input.priceCents * input.quantity);
  const feesCents = cents(input.feeCents * input.quantity + basisPoints(subtotalCents,input.serviceFeeBps));
  const value = input.discountValue || 0;
  const discountCents = Math.min(subtotalCents, input.discountType === 'comp' ? subtotalCents : input.discountType === 'percent_bps' ? basisPoints(subtotalCents,value) : input.discountType === 'amount_cents' ? value : 0);
  const taxCents = basisPoints(subtotalCents-discountCents,input.taxBps);
  return {subtotalCents,feesCents,discountCents,taxCents,totalCents:cents(subtotalCents+feesCents-discountCents+taxCents)};
}
export function minimum(input: {requiredItems:number; qualifyingItems:number; cheapestCents:number; floorCents?:number; qualifyingCents?:number; waived?:boolean}) {
  for(const n of [input.requiredItems,input.qualifyingItems,input.cheapestCents,input.floorCents||0,input.qualifyingCents||0]) cents(n);
  return input.waived ? 0 : Math.max(Math.max(0,input.requiredItems-input.qualifyingItems)*input.cheapestCents,Math.max(0,(input.floorCents||0)-(input.qualifyingCents||0)));
}
export function payout(slots:{feeCents:number;bonusCents:number}[], runFeeCents=0) { cents(runFeeCents); return cents((runFeeCents || slots.reduce((sum,s)=>sum+cents(s.feeCents),0))+slots.reduce((sum,s)=>sum+cents(s.bonusCents),0)); }
export function settlement(input:{ticketGrossCents:number;feesCents:number;discountsCents:number;refundsCents:number;foodBeverageGrossCents:number;minimumShortfallRevenueCents:number;talentCostCents:number}) {
  Object.values(input).forEach(cents);
  return input.ticketGrossCents+input.feesCents-input.discountsCents-input.refundsCents+input.foodBeverageGrossCents+input.minimumShortfallRevenueCents-input.talentCostCents;
}
export function selfRefundAllowed(startsAt:Date,windowHours:number,now=new Date()) { cents(windowHours); return startsAt.getTime()-now.getTime() >= windowHours*3600000; }

export type RunClosePlan =
  | { ok: false; reason: string }
  | { ok: true; createPayout: boolean; payoutCents: number; note: string };

/** Decides whether a headliner run can close and what the one run-level payout is. Pure: no I/O. */
export function runClosePlan(input: { runStatus: string; runFeeCents: number; showStatuses: string[]; headlinerPerformedShows: number }): RunClosePlan {
  cents(input.runFeeCents);
  if (input.runStatus === 'closed') return { ok: false, reason: 'Run already closed' };
  if (!input.showStatuses.length) return { ok: false, reason: 'Run has no shows' };
  const open = input.showStatuses.filter((s) => !['settled', 'cancelled'].includes(s)).length;
  if (open) return { ok: false, reason: `${open} show${open === 1 ? '' : 's'} in the run not settled or cancelled yet` };
  if (!Number.isInteger(input.headlinerPerformedShows) || input.headlinerPerformedShows < 0) throw new Error('Invalid performed count');
  if (input.headlinerPerformedShows === 0) return { ok: true, createPayout: false, payoutCents: 0, note: 'Headliner performed none of the run shows; no run payout' };
  if (input.runFeeCents === 0) return { ok: true, createPayout: false, payoutCents: 0, note: 'Run fee is zero; no run payout' };
  return { ok: true, createPayout: true, payoutCents: input.runFeeCents, note: 'Run fee for the headliner' };
}
