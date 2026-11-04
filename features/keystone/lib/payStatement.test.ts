import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, parseYear, statementCsv, yearRange, type PayoutInput } from './payStatement';

const tz = 'America/Chicago';
const at = (s: string) => new Date(s);
const p = (id: string, status: string, amountCents: number, paidAt: string | null, extra: Partial<PayoutInput> = {}): PayoutInput => ({ id, status, amountCents, paidAt: paidAt ? at(paidAt) : null, createdAt: at('2026-01-01T00:00:00Z'), method: 'check', reference: '', showTitle: 'Show ' + id, showAt: null, runNote: null, ...extra });

test('year range follows the venue timezone, not UTC', () => {
  const { start, endExclusive } = yearRange(2026, tz);
  assert.equal(start.toISOString(), '2026-01-01T06:00:00.000Z'); assert.equal(endExclusive.toISOString(), '2027-01-01T06:00:00.000Z');
  const r = buildStatement([p('a', 'paid', 100, '2026-01-01T03:00:00Z'), p('b', 'paid', 200, '2027-01-01T03:00:00Z')], start, endExclusive);
  assert.deepEqual(r.rows.map((x) => x.id), ['b'], 'a payout at 9pm on 31 Dec local belongs to the old year, 9pm 31 Dec 2026 local to this one');
});
test('only paid payouts in the year count; running total in paid order; pending separate; void ignored', () => {
  const { start, endExclusive } = yearRange(2026, tz);
  const r = buildStatement([
    p('3', 'paid', 5000, '2026-09-01T20:00:00Z'), p('1', 'paid', 2500, '2026-03-01T20:00:00Z'), p('2', 'paid', 1000, '2026-03-01T20:00:00Z'),
    p('d', 'draft', 700, null), p('x', 'approved', 300, null), p('v', 'void', 9999, '2026-04-01T20:00:00Z'), p('old', 'paid', 123, '2025-12-30T20:00:00Z'),
  ], start, endExclusive);
  assert.deepEqual(r.rows.map((x) => [x.id, x.ytdCents]), [['1', 2500], ['2', 3500], ['3', 8500]]);
  assert.equal(r.paidCents, 8500); assert.equal(r.pendingCents, 1000); assert.equal(r.pendingCount, 2); assert.equal(r.undated, 0);
});
test('a paid payout with no date is flagged, never guessed into a year', () => {
  const { start, endExclusive } = yearRange(2026, tz);
  const r = buildStatement([p('u', 'paid', 400, null)], start, endExclusive); assert.equal(r.rows.length, 0); assert.equal(r.undated, 1); assert.equal(r.paidCents, 0);
});
test('run fees are labelled as run fees', () => {
  const { start, endExclusive } = yearRange(2026, tz);
  const r = buildStatement([p('r', 'paid', 90000, '2026-05-01T20:00:00Z', { showTitle: null, runNote: 'Spring run' })], start, endExclusive);
  assert.equal(r.rows[0].kind, 'run'); assert.equal(r.rows[0].label, 'Run fee: Spring run');
  const o = buildStatement([p('o', 'paid', 100, '2026-05-01T20:00:00Z', { showTitle: null, runNote: null })], start, endExclusive); assert.equal(o.rows[0].kind, 'other'); assert.equal(o.rows[0].label, 'Payout');
});
test('year must be a sensible integer', () => {
  const now = new Date('2026-11-04T00:00:00Z');
  assert.equal(parseYear('2026', now), 2026); assert.equal(parseYear(2027, now), 2027);
  for (const bad of ['abc', 1999, 2028, 2026.5, '', null]) assert.throws(() => parseYear(bad, now));
});
test('the CSV ends with the year total, neutralises formulas and quotes commas', () => {
  const { start, endExclusive } = yearRange(2026, tz);
  const r = buildStatement([p('1', 'paid', 2500, '2026-03-01T20:00:00Z', { showTitle: '=HYPERLINK("x")', reference: 'chk 1, 2' })], start, endExclusive);
  const csv = statementCsv({ stageName: 'Dee, Dee', legalName: 'Dee Doe' }, 2026, r.rows, tz, r.paidCents).trim().split('\n');
  assert.equal(csv.length, 3); assert(csv[1].includes(`"'=HYPERLINK(""x"")"`)); assert(csv[1].includes('"chk 1, 2"')); assert(csv[1].includes('"Dee, Dee"'));
  assert.equal(csv[2], '2026 total,"Dee, Dee",Dee Doe,,,,,25.00,25.00');
});
