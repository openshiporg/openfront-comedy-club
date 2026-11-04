import { test } from 'node:test'; import assert from 'node:assert/strict';
import { parsePeriod, buildShowRows, totals, runRollups, runFeeInPeriod, csvText, centsText, reportCsv, MAX_PERIOD_DAYS } from './reporting';

const stl = { status: 'closed', ticketGrossCents: 10000, feesCents: 500, discountsCents: 300, refundsCents: 200, foodBeverageGrossCents: 4000, minimumShortfallRevenueCents: 600, tipsCents: 900, talentCostCents: 5000, netCents: 9600 };
const shows = [
  { id: 's1', title: 'Friday Late Show', startsAt: new Date('2026-11-07T03:00:00Z'), status: 'settled', runId: 'r1', settlement: stl },
  { id: 's2', title: '=HYPERLINK("x")', startsAt: new Date('2026-11-08T03:00:00Z'), status: 'on_sale', runId: 'r1', settlement: null },
];
const tk = (showId: string, status: string, orderStatus = 'paid') => ({ showId, status, orderStatus });

test('attendance splits sold, comp, checked-in and no-show; money only from a closed settlement', () => {
  const rows = buildShowRows(shows as any, [tk('s1', 'checked_in'), tk('s1', 'checked_in'), tk('s1', 'valid'), tk('s1', 'checked_in', 'comp'), tk('s1', 'valid', 'comp'), tk('s1', 'refunded'), tk('s1', 'void'), tk('s2', 'valid')]);
  const a = rows[0];
  assert.deepEqual([a.sold, a.comp, a.checkedIn, a.noShow], [3, 2, 3, 2]);
  assert.deepEqual([a.ticketCents, a.fbCents, a.talentCents, a.netCents], [10000 + 500 - 300 - 200, 4600, 5000, 9600]);
  const b = rows[1];
  assert.deepEqual([b.sold, b.noShow, b.settled, b.netCents], [1, null, false, 0], 'future night: no no-show count, no revenue');
});
test('open settlement counts as no revenue', () => {
  const [r] = buildShowRows([{ ...shows[0], settlement: { ...stl, status: 'open' } }] as any, []);
  assert.equal(r.settled, false); assert.equal(r.netCents, 0);
});
const P0 = new Date('2026-11-01T00:00:00Z'), P1 = new Date('2026-12-01T00:00:00Z');
test('run fee is its own line: period net = nights net - run fee, and the run rollup agrees', () => {
  const rows = buildShowRows(shows as any, [tk('s1', 'checked_in')]);
  const runs = [{ id: 'r1', headliner: 'Pat', payoutCents: 3000, lastShowAt: new Date('2026-11-08T03:00:00Z') }];
  const [run] = runRollups(rows, runs, P0, P1);
  const t = totals(rows, run.runFeeCents);
  assert.deepEqual([t.nightsNetCents, t.runFeeCents, t.netCents], [9600, 3000, 6600]);
  assert.deepEqual([run.nightsNetCents, run.runFeeCents, run.netCents], [9600, 3000, 6600]);
  assert.equal(t.netCents, run.netCents, 'single run in period: totals and rollup reconcile');
  assert.equal(t.talentCents, 5000, 'talent cost excludes the run fee, which is never inside a show settlement');
});
test('run fee is counted once across periods: only the period holding the last show', () => {
  const run = { id: 'r1', headliner: 'Pat', payoutCents: 3000, lastShowAt: new Date('2026-11-30T23:00:00Z') };
  const oct = [new Date('2026-10-01T00:00:00Z'), P0] as const, nov = [P0, P1] as const, dec = [P1, new Date('2027-01-01T00:00:00Z')] as const;
  const fees = [oct, nov, dec].map(([a, b]) => runFeeInPeriod(run, a, b));
  assert.deepEqual(fees, [0, 3000, 0]); assert.equal(fees.reduce((n, x) => n + x, 0), 3000);
  assert.equal(runFeeInPeriod({ ...run, payoutCents: 0 }, P0, P1), 0, 'no payout yet, no fee');
  assert.equal(runFeeInPeriod({ ...run, lastShowAt: null }, P0, P1), 0);
  const [r] = runRollups([], [run], oct[0], oct[1]); assert.equal(r.feeInLaterPeriod, true);
});
test('period parsing is inclusive in venue time, DST-safe, bounded', () => {
  const p = parsePeriod('2026-11-01', '2026-11-01', 'America/Chicago'); // DST ends that day: 25 hours
  assert.equal((p.endExclusive.getTime() - p.start.getTime()) / 36e5, 25);
  assert.throws(() => parsePeriod('2026-11-02', '2026-11-01', 'UTC'), /before/);
  assert.throws(() => parsePeriod('2026-02-30', '2026-03-01', 'UTC'), /Invalid/);
  assert.throws(() => parsePeriod('11/1/2026', '2026-11-02', 'UTC'), /YYYY/);
  assert.throws(() => parsePeriod('2025-01-01', '2026-12-31', 'UTC'), new RegExp(String(MAX_PERIOD_DAYS)));
});
test('CSV neutralises formulas, quotes, and writes exact cents', () => {
  for (const v of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx']) assert.ok(csvText(v).startsWith("'") || csvText(v).startsWith('"\''), v);
  assert.equal(csvText('a,"b"'), '"a,""b"""'); assert.equal(centsText(-5), '-0.05'); assert.equal(centsText(123456), '1234.56');
  const csv = reportCsv(buildShowRows(shows as any, [tk('s1', 'checked_in')]), 'America/Chicago').split('\r\n');
  assert.equal(csv[0], 'date,show,status,tickets_sold,comps,checked_in,no_shows,settled,ticket_revenue,food_beverage_revenue,talent_cost,net');
  assert.equal(csv[1], '2026-11-06,Friday Late Show,settled,1,0,1,0,yes,100.00,46.00,50.00,96.00');
  assert.ok(csv[2].includes("'=HYPERLINK") && csv[2].endsWith(',no,,,,'));
  assert.equal(csv[3], '');
  const withFee = reportCsv(buildShowRows(shows as any, [tk('s1', 'checked_in')]), 'America/Chicago', [{ headliner: 'Pat', at: new Date('2026-11-08T03:00:00Z'), cents: 3000 }]).split('\r\n');
  assert.equal(withFee[3], '2026-11-07,Run fee: Pat,run_fee,,,,,,,,30.00,-30.00');
  const net = withFee.slice(1, 4).map((l) => l.split(',').pop()!).filter((x) => x && !Number.isNaN(Number(x))).reduce((n, x) => n + Math.round(Number(x) * 100), 0);
  assert.equal(net, 9600 - 3000, 'net column sums to the report net');

});
