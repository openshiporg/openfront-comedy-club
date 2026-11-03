import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedTime } from './time';
test('Chicago evening in CST and CDT', () => {
  assert.equal(zonedTime('2026-11-03', '20:00', 'America/Chicago').toISOString(), '2026-11-04T02:00:00.000Z');
  assert.equal(zonedTime('2026-07-03', '20:00', 'America/Chicago').toISOString(), '2026-07-04T01:00:00.000Z');
});
test('day after DST end uses the new offset', () => assert.equal(zonedTime('2026-11-01', '22:00', 'America/Chicago').toISOString(), '2026-11-02T04:00:00.000Z'));
