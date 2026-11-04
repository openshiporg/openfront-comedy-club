import test from 'node:test';
import assert from 'node:assert/strict';
import { expandDays, planSeries, planProblems, normalizeEdit, editable, localTime, MAX_SERIES_SHOWS } from './series';

const tz = 'America/Chicago';
const src = { startsAt: new Date('2027-01-06T02:00:00Z'), doorsAt: new Date('2027-01-06T01:00:00Z'), endsAt: new Date('2027-01-06T03:30:00Z') }; // Tue 8pm local
const now = new Date('2026-11-04T00:00:00Z');

test('weekly counts expand to sorted unique days; explicit lists are deduped', () => {
  assert.deepEqual(expandDays({ from: '2027-01-05', count: 3 }), ['2027-01-05', '2027-01-12', '2027-01-19']);
  assert.deepEqual(expandDays({ dates: ['2027-02-02', '2027-01-05', '2027-02-02'] }), ['2027-01-05', '2027-02-02']);
  assert.deepEqual(expandDays({ from: '2027-01-30', count: 2, everyDays: 3 }), ['2027-01-30', '2027-02-02']);
});
test('bad patterns are refused', () => {
  for (const p of [{}, { from: '2027-01-05' }, { from: '2027-01-05', count: 0 }, { from: '2027-01-05', count: MAX_SERIES_SHOWS + 1 }, { from: '2027-02-30', count: 2 }, { dates: ['01/05/2027'] }, { from: '2027-01-05', count: 2, everyDays: 0 }, { dates: ['2027-01-01', '2028-06-01'] }])
    assert.throws(() => expandDays(p as any));
});
test('copies keep the local start time across a DST change, with the same doors lead and length', () => {
  assert.equal(localTime(src.startsAt, tz), '20:00');
  const rows = planSeries(src, tz, { from: '2027-03-09', count: 2 }, [], now); // 13 Mar 2027 is the US spring-forward weekend
  assert.deepEqual(rows.map((r) => localTime(r.startsAt, tz)), ['20:00', '20:00']);
  assert.deepEqual(rows.map((r) => r.startsAt.toISOString()), ['2027-03-10T02:00:00.000Z', '2027-03-17T01:00:00.000Z']);
  for (const r of rows) { assert.equal(r.startsAt.getTime() - r.doorsAt!.getTime(), 3600e3); assert.equal(r.endsAt!.getTime() - r.startsAt.getTime(), 5400e3); }
});
test('startTime overrides the time of day', () => {
  assert.equal(localTime(planSeries(src, tz, { dates: ['2027-02-02'] }, [], now, '21:30')[0].startsAt, tz), '21:30');
  assert.throws(() => planSeries(src, tz, { dates: ['2027-02-02'] }, [], now, '9pm'));
});
test('past dates and room clashes are flagged per row; a free room is clean', () => {
  const rows = planSeries(src, tz, { dates: ['2026-10-01', '2027-02-02', '2027-02-09'] }, [{ id: 'x', title: 'Late Show', startsAt: new Date('2027-02-03T01:30:00Z'), endsAt: null }], now);
  assert.equal(rows[0].problem, 'In the past'); assert.match(rows[1].problem!, /Room already booked: Late Show/); assert.equal(rows[2].problem, null);
  assert.equal(planProblems(rows).length, 2);
});
test('back-to-back shows are not a clash; a missing end time counts as 90 minutes', () => {
  const a = planSeries(src, tz, { dates: ['2027-02-02'] }, [{ id: 'x', title: 'Early', startsAt: new Date('2027-02-03T00:30:00Z'), endsAt: new Date('2027-02-03T02:00:00Z') }], now);
  assert.equal(a[0].problem, null, 'ends exactly when the new show starts');
  const b = planSeries({ ...src, endsAt: null }, tz, { dates: ['2027-02-02'] }, [{ id: 'x', title: 'After', startsAt: new Date('2027-02-03T03:00:00Z'), endsAt: null }], now);
  assert.match(b[0].problem!, /booked/, 'a 90 minute default reaches 03:30');
});
test('occurrence keys are unique per day', () => {
  const rows = planSeries(src, tz, { from: '2027-01-05', count: 4 }, [], now, undefined, 'series:abc'); assert.equal(new Set(rows.map((r) => r.key)).size, 4); assert.equal(rows[0].key, 'series:abc:2027-01-05');
});
test('edits are validated and need at least one change', () => {
  assert.deepEqual(normalizeEdit({ title: ' New ', capacity: '80' }), { title: 'New', capacity: 80 });
  for (const bad of [{}, { title: '  ' }, { ageRestriction: '16' }, { startTime: '25:00' }, { capacity: 0 }, { capacity: 1.5 }]) assert.throws(() => normalizeEdit(bad));
});
test('only future, unstarted shows are editable', () => {
  const f = new Date('2027-01-01T00:00:00Z');
  assert.equal(editable({ startsAt: f, status: 'on_sale' }, now), true); assert.equal(editable({ startsAt: f, status: 'draft' }, now), true);
  for (const s of ['cancelled', 'completed', 'settled', 'in_progress', 'doors_open']) assert.equal(editable({ startsAt: f, status: s }, now), false);
  assert.equal(editable({ startsAt: new Date('2026-01-01T00:00:00Z'), status: 'on_sale' }, now), false); assert.equal(editable({ startsAt: null, status: 'draft' }, now), false);
});
