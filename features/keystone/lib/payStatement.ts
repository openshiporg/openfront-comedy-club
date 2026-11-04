import { zonedTime } from './time';
import { centsText, csvText } from './reporting';

export type PayoutInput = { id: string; status: string; amountCents: number; paidAt: Date | null; createdAt: Date; method: string; reference: string; showTitle: string | null; showAt: Date | null; runNote: string | null };
export type StatementRow = { id: string; paidAt: Date; kind: 'show' | 'run' | 'other'; label: string; method: string; reference: string; amountCents: number; ytdCents: number };

export const MIN_YEAR = 2000;
export function parseYear(v: unknown, now = new Date()): number {
  const y = Number(v);
  if (!Number.isInteger(y) || y < MIN_YEAR || y > now.getUTCFullYear() + 1) throw new Error('Choose a valid year');
  return y;
}
/** The calendar year in the venue's timezone, as a half-open UTC range. */
export function yearRange(year: number, tz: string) { return { start: zonedTime(`${year}-01-01`, '00:00', tz), endExclusive: zonedTime(`${year + 1}-01-01`, '00:00', tz) }; }

/**
 * One payee's statement for a year. Only PAID payouts dated inside the year count; the year-to-date total runs in paid order
 * (ties by id). Draft and approved payouts are pending money and are reported separately; void ones are ignored. A paid payout
 * with no paid date cannot be placed in a year, so it is flagged instead of being guessed into one.
 */
export function buildStatement(payouts: PayoutInput[], start: Date, endExclusive: Date) {
  const paid = payouts.filter((p) => p.status === 'paid');
  const undated = paid.filter((p) => !p.paidAt).length;
  const inYear = paid.filter((p) => p.paidAt && p.paidAt >= start && p.paidAt < endExclusive).sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime() || a.id.localeCompare(b.id));
  let ytd = 0;
  const rows: StatementRow[] = inYear.map((p) => {
    ytd += p.amountCents;
    return { id: p.id, paidAt: p.paidAt!, kind: p.showTitle ? 'show' : p.runNote !== null ? 'run' : 'other', label: p.showTitle || (p.runNote !== null ? (p.runNote ? `Run fee: ${p.runNote}` : 'Run fee') : 'Payout'), method: p.method, reference: p.reference, amountCents: p.amountCents, ytdCents: ytd };
  });
  const pending = payouts.filter((p) => p.status === 'draft' || p.status === 'approved');
  return { rows, paidCents: ytd, pendingCents: pending.reduce((n, p) => n + p.amountCents, 0), pendingCount: pending.length, undated };
}

export function statementCsv(payee: { stageName: string; legalName: string }, year: number, rows: StatementRow[], tz: string, paidCents: number) {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const head = ['Paid on', 'Payee', 'Legal name', 'For', 'Type', 'Method', 'Reference', 'Amount', 'Year to date'];
  const lines = rows.map((r) => [day(r.paidAt), csvText(payee.stageName), csvText(payee.legalName), csvText(r.label), r.kind === 'run' ? 'run_fee' : r.kind, r.method, csvText(r.reference), centsText(r.amountCents), centsText(r.ytdCents)].join(','));
  lines.push([`${year} total`, csvText(payee.stageName), csvText(payee.legalName), '', '', '', '', centsText(paidCents), centsText(paidCents)].join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}
