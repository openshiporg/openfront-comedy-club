import { audit, command, requirePermission } from '../lib/commands';
import { buildShowRows, parsePeriod, reportCsv, runFeeInPeriod, runRollups, totals } from '../lib/reporting';

async function venueTz(prisma: any) { return (await prisma.venue.findFirst({ select: { timezone: true } }))?.timezone || 'America/Chicago'; }

/** Reads shows in the period, their tickets and closed settlements. Revenue exists only for settled nights. */
async function load(db: any, from: string, to: string) {
  const tz = await venueTz(db);
  const { start, endExclusive } = parsePeriod(from, to, tz);
  const shows = await db.show.findMany({
    where: { startsAt: { gte: start, lt: endExclusive }, status: { notIn: ['draft', 'cancelled'] } },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, startsAt: true, status: true, runId: true, settlement: { select: { status: true, ticketGrossCents: true, feesCents: true, discountsCents: true, refundsCents: true, foodBeverageGrossCents: true, minimumShortfallRevenueCents: true, tipsCents: true, talentCostCents: true, netCents: true } } },
  });
  const ids = shows.map((s: any) => s.id);
  const tickets = ids.length ? await db.ticket.findMany({ where: { showId: { in: ids } }, select: { showId: true, status: true, order: { select: { status: true } } } }) : [];
  const rows = buildShowRows(shows, tickets.map((t: any) => ({ showId: t.showId, status: t.status, orderStatus: t.order?.status || 'paid' })));
  const runIds = [...new Set(shows.map((s: any) => s.runId).filter(Boolean))] as string[];
  const runs = runIds.length ? await db.run.findMany({ where: { id: { in: runIds } }, select: { id: true, headliner: { select: { stageName: true } }, payouts: { where: { runId: { not: null }, status: { not: 'void' } }, select: { amountCents: true } } } }) : [];
  const lasts = runIds.length ? await db.show.groupBy({ by: ['runId'], where: { runId: { in: runIds }, status: { notIn: ['draft', 'cancelled'] } }, _max: { startsAt: true } }) : [];
  const lastBy = new Map<string, Date | null>(lasts.map((l: any) => [l.runId, l._max.startsAt]));
  const inputs = runs.map((r: any) => ({ id: r.id, headliner: r.headliner?.stageName || 'No headliner', payoutCents: r.payouts.reduce((n: number, p: any) => n + p.amountCents, 0), lastShowAt: lastBy.get(r.id) || null }));
  const rollups = runRollups(rows, inputs, start, endExclusive);
  const runFees = inputs.map((r: any) => ({ headliner: r.headliner, at: r.lastShowAt as Date, cents: runFeeInPeriod(r, start, endExclusive) })).filter((f: any) => f.cents > 0);
  const feeTotal = runFees.reduce((n: number, f: any) => n + f.cents, 0);
  return { tz, rows, totals: totals(rows, feeTotal), runs: rollups, runFees };
}

export async function showReport(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  const r = await load(c.prisma, a.from, a.to);
  return { from: a.from, to: a.to, timezone: r.tz, totals: r.totals, runs: r.runs, shows: r.rows };
}

/** Builds the CSV on the server and records who exported which period. A replay returns the same file. */
export async function exportShowReport(_: any, a: any, c: any) {
  requirePermission(c, 'canManagePayouts');
  return command(c, 'exportShowReport', { from: a.from, to: a.to, idempotencyKey: a.idempotencyKey }, async tx => {
    const r = await load(tx, a.from, a.to);
    const out = { fileName: `show-report-${a.from}-to-${a.to}.csv`, rows: r.rows.length + r.runFees.length, netCents: r.totals.netCents, csv: reportCsv(r.rows, r.tz, r.runFees) };
    await audit(tx, c, 'report_exported', 'ShowSettlement', `period:${a.from}:${a.to}`, null, { from: a.from, to: a.to, rows: out.rows, netCents: out.netCents }, a.idempotencyKey);
    return out;
  });
}
