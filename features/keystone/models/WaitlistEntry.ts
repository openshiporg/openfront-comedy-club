import { text, integer, timestamp, relationship } from '@keystone-6/core/fields';
import { domainList, lifecycle, unique } from './domainFields';

// A party waiting for a sold-out show. An offer reserves seats through a real InventoryHold,
// so expiry, checkout and capacity all reuse the ticketing rules.
export const WaitlistEntry = domainList({
  entryKey: unique(),
  show: relationship({ ref: 'Show.waitlist' }),
  name: text(),
  email: text(),
  partySize: integer({ defaultValue: 1 }),
  status: lifecycle(['waiting', 'offered', 'converted', 'expired', 'cancelled']),
  hold: relationship({ ref: 'InventoryHold.waitlistEntry' }),
  offeredAt: timestamp(),
  offerExpiresAt: timestamp(),
  notifications: relationship({ ref: 'NotificationRecord.waitlistEntry', many: true }),
}, 'canManageOrders', true);
