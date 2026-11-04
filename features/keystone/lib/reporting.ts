import { zonedTime } from './time';

export const MAX_PERIOD_DAYS = 366;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive calendar days in the venue timezone, as a half-open UTC range. */
export function parsePeriod(from: string, to: string, tz: string) {
  if (!DAY.test(String(from)) || !DAY.test(String(to))) throw new Error('Dates must be YYYY-MM-DD');
  const check = (d: string) => { const x = new Date(d + 'T00:00:00Z'); if (Number.isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== d) throw new Error('Invalid date'); return x; };
  const f = check(from), t = check(to);
  if (t < f) throw new Error('End date is before start date');
  if ((t.getTime() - f.getTime()) / 864e5 + 1 > MAX_PERIOD_DAYS) throw new Error(`Choose a period of at most ${MAX_PERIOD_DAYS} days`);
  const next = new Date(t.getTime() + 864e5).toISOString().slice(0, 10);
  return { start: zonedTime(from, '00:00', tz), endExclusive: zonedTime(next, '00:00', tz) };
}

export type ShowInput = { id: string; title: string; startsAt: Date; status: string; runId: string | null; settlement: null | { status: string; ticketGrossCents: number; feesCents: number; discountsCents: number; refundsCents: number; foodBeverageGrossCents: number; minimumShortfallRevenueCents: number; tipsCents: number; talentCostCents: number; netCents: number } };
export type TicketInput = { showId: string; status: string; orderStatus: string };
export type ShowRow = {
  id: string; title: string; startsAt: Date; status: string; runId: string | null;
  sold: number; comp: number; checkedIn: number; noShow: number | null;
  settled: boolean; ticketCents: number; fbCents: number; talentCents: number; netCents: number;
};

const ENTERED = new Set(['valid', 'checked_in']);
const DONE = new Set(['completed', 'settled']);

/** Attendance comes from tickets, money only from a closed settlement: an open night has no revenue yet. */
export function buildShowRows(shows: ShowInput[], tickets: TicketInput[]): ShowRow[] {
  const by = new Map<string, { sold: number; comp: number; checkedIn: number }>();
  for (const t of tickets) {
    if (!ENTERED.has(t.status)) continue;
    const a = by.get(t.showId) || { sold: 0, comp: 0, checkedIn: 0 };
    if (t.orderStatus === 'comp') a.comp++; else a.sold++;
    if (t.status === 'checked_in') a.checkedIn++;
    by.set(t.showId, a);
  }
  return shows.map((s) => {
    const a = by.get(s.id) || { sold: 0, comp: 0, checkedIn: 0 };
    const st = s.settlement?.status === 'closed' ? s.settlement : null;
    return {
      id: s.id, title: s.title, startsAt: s.startsAt, status: s.status, runId: s.runId, ...a,
      noShow: DONE.has(s.status) ? a.sold + a.comp - a.checkedIn : null,
      settled: Boolean(st),
      ticketCents: st ? st.ticketGrossCents + st.feesCents - st.discountsCents - st.refundsCents : 0,
      fbCents: st ? st.foodBeverageGrossCents + st.minimumShortfallRevenueCents : 0,
      talentCents: st ? st.talentCostCents : 0,
      netCents: st ? st.netCents : 0,
    };
  });
}

/**
 * Net = settled nights' net minus run fees. A show settlement never contains the headliner's run fee
 * (closeShow pays that headliner only per-show bonuses; closeRun pays the fee once, as its own payout),
 * so run fees are a separate line that is subtracted here, once.
 */
export function totals(rows: ShowRow[], runFeeCents = 0) {
  const sum = (f: (r: ShowRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const nightsNetCents = sum((r) => r.netCents);
  return { shows: rows.length, settledShows: rows.filter((r) => r.settled).length, sold: sum((r) => r.sold), comp: sum((r) => r.comp), checkedIn: sum((r) => r.checkedIn), noShow: sum((r) => r.noShow || 0), ticketCents: sum((r) => r.ticketCents), fbCents: sum((r) => r.fbCents), talentCents: sum((r) => r.talentCents), runFeeCents, nightsNetCents, netCents: nightsNetCents - runFeeCents };
}

export type RunInput = { id: string; headliner: string; payoutCents: number; lastShowAt: Date | null };
/** A run's fee belongs to the period containing its last show, so it is counted exactly once across periods. */
export function runFeeInPeriod(run: RunInput, start: Date, endExclusive: Date) {
  return run.lastShowAt && run.lastShowAt >= start && run.lastShowAt < endExclusive ? run.payoutCents : 0;
}
export function runRollups(rows: ShowRow[], runs: RunInput[], start: Date, endExclusive: Date) {
  return runs.map((r) => {
    const mine = rows.filter((x) => x.runId === r.id);
    const nights = mine.reduce((n, x) => n + x.netCents, 0);
    const fee = runFeeInPeriod(r, start, endExclusive);
    return { id: r.id, headliner: r.headliner, shows: mine.length, settled: mine.filter((x) => x.settled).length, nightsNetCents: nights, runFeeCents: fee, feeInLaterPeriod: r.payoutCents > 0 && fee === 0, netCents: nights - fee, lastShowAt: r.lastShowAt };
  });
}

/** Text that starts with a formula character is neutralised so spreadsheets never execute it. */
export function csvText(v: unknown) { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; }
export const centsText = (c: number) => (c < 0 ? '-' : '') + Math.floor(Math.abs(c) / 100) + '.' + String(Math.abs(c) % 100).padStart(2, '0');

export function reportCsv(rows: ShowRow[], tz: string, runFees: { headliner: string; at: Date; cents: number }[] = []) {
  const head = ['date', 'show', 'status', 'tickets_sold', 'comps', 'checked_in', 'no_shows', 'settled', 'ticket_revenue', 'food_beverage_revenue', 'talent_cost', 'net'];
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const lines = rows.map((r) => [day(r.startsAt), csvText(r.title), csvText(r.status), r.sold, r.comp, r.checkedIn, r.noShow ?? '', r.settled ? 'yes' : 'no', ...(r.settled ? [r.ticketCents, r.fbCents, r.talentCents, r.netCents].map(centsText) : ['', '', '', ''])].join(','));
  // Run fees are their own rows so the net column sums to the report's net.
  for (const f of runFees.filter((x) => x.cents > 0)) lines.push([day(f.at), csvText(`Run fee: ${f.headliner}`), 'run_fee', '', '', '', '', '', '', '', centsText(f.cents), centsText(-f.cents)].join(','));
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}
