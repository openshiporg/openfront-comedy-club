import test from 'node:test';
import assert from 'node:assert/strict';
import { canUsePlatformPage } from './sidebarAccess';

const hiddenShows = [{ path: 'shows', isHidden: true }, { path: 'tickets', isHidden: false }];
const role = (r: Record<string, boolean>) => ({ role: { canAccessDashboard: true, ...r } });

test('Tonight opens for door, floor and show staff without reading shows', () => {
  assert.equal(canUsePlatformPage('tonight', hiddenShows, role({ canManageDoor: true })), true);
  assert.equal(canUsePlatformPage('tonight', hiddenShows, role({ canManageChecks: true })), true);
  assert.equal(canUsePlatformPage('tonight', [], role({ canManageShows: true })), true);
});

test('Tonight stays closed for a role with no door, floor or show permission', () => {
  assert.equal(canUsePlatformPage('tonight', hiddenShows, role({ canIssueRefunds: true, canReadPayments: true })), false);
});

test('other pages still follow their lists', () => {
  assert.equal(canUsePlatformPage('shows', hiddenShows, role({ canManageDoor: true })), false);
});
