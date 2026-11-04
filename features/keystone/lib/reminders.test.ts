import { test } from 'node:test'; import assert from 'node:assert/strict';
import { reminderSendAfter, inReminderWindow, showReminderMessage, lineupConfirmationMessage, showReminderKey, lineupConfirmationKey } from './reminders';
const tz = 'America/Chicago';
test('send time is 9:00 venue time on show day, capped 3h before an early show, never in the past', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(reminderSendAfter(new Date('2026-11-07T01:00:00Z'), tz, now).toISOString(), '2026-11-06T15:00:00.000Z'); // Fri 7pm CDT show -> Fri 9:00 CDT... CST after DST
  assert.equal(reminderSendAfter(new Date('2026-11-06T16:00:00Z'), tz, now).toISOString(), '2026-11-06T13:00:00.000Z'); // 10:00 CST show -> 3h before
  assert.equal(reminderSendAfter(new Date('2026-11-05T14:00:00Z'), tz, now).toISOString(), now.toISOString()); // already past -> now
});
test('window is after now and within 48h', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  assert.equal(inReminderWindow(new Date('2026-11-05T11:00:00Z'), now), false);
  assert.equal(inReminderWindow(new Date('2026-11-07T12:00:00Z'), now), true);
  assert.equal(inReminderWindow(new Date('2026-11-07T12:00:01Z'), now), false);
});
test('keys are deterministic per order and per slot, so reruns cannot duplicate', () => {
  assert.equal(showReminderKey('o1'), 'show_reminder:o1'); assert.equal(lineupConfirmationKey('s1'), 'lineup_confirmation:s1');
});
test('messages carry the facts the recipient needs', () => {
  const show = { title: 'Friday Late Show', startsAt: new Date('2026-11-07T02:00:00Z'), doorsAt: new Date('2026-11-07T01:00:00Z') };
  const r = showReminderMessage({ name: 'Ana', partySize: 4, orderNumber: 'ORD-9' }, show, tz, 'Laugh Track');
  assert.match(r.subject, /Friday Late Show/); assert.match(r.body, /party of 4/); assert.match(r.body, /ORD-9/); assert.match(r.body, /Doors open/);
  const l = lineupConfirmationMessage({ name: 'Maya' }, show, { role: 'guest_set', setMinutes: 15 }, tz, 'Laugh Track');
  assert.match(l.body, /guest set \(15 min\)/); assert.match(l.subject, /Confirmed/);
});
