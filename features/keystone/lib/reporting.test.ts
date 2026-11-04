import { test } from 'node:test'; import assert from 'node:assert/strict';
import { parsePeriod, buildShowRows, totals, runRollups, csvText, centsText, reportCsv, MAX_PERIOD_DAYS } from './reporting';

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
test('totals and run rollups subtract the run fee once', () => {
  const rows = buildShowRows(shows as any, [tk('s1', 'checked_in')]);
  const t = totals(rows); assert.deepEqual([t.shows, t.settledShows, t.netCents], [2, 1, 9600]);
  const [run] = runRollups(rows, [{ id: 'r1', headliner: 'Pat', shows: 2, runFeeCents: 3000, paidRunFeeCents: 3000 }]);
  assert.deepEqual([run.shows, run.settled, run.nightsNetCents, run.netCents], [2, 1, 9600, 6600]);
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
});
