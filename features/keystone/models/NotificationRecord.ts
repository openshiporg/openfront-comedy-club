import { text, json, timestamp, relationship } from '@keystone-6/core/fields';
import { domainList, lifecycle, choice, unique } from './domainFields';

// Outbound message queued for a transport to deliver. Nothing is sent from here; a transport delivers rows whose sendAfter has passed.
export const NotificationRecord = domainList({
  notificationKey: unique(),
  kind: choice(['waitlist_offer', 'show_reminder', 'lineup_confirmation', 'lineup_invite', 'ticket_transfer']),
  channel: choice(['email']),
  toEmail: text(),
  subject: text(),
  body: text({ ui: { displayMode: 'textarea' } }),
  payload: json(),
  status: lifecycle(['queued', 'sent', 'failed', 'cancelled']),
  sendAfter: timestamp(),
  sentAt: timestamp(),
  show: relationship({ ref: 'Show.notifications' }),
  waitlistEntry: relationship({ ref: 'WaitlistEntry.notifications' }),
}, 'canManageOrders', true);
