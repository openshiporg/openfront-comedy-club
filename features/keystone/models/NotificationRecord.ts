import { text, json, timestamp, relationship } from '@keystone-6/core/fields';
import { domainList, lifecycle, choice, unique } from './domainFields';

// Outbound message queued for a transport to deliver. Nothing is sent from here.
export const NotificationRecord = domainList({
  notificationKey: unique(),
  kind: choice(['waitlist_offer']),
  channel: choice(['email']),
  toEmail: text(),
  subject: text(),
  body: text({ ui: { displayMode: 'textarea' } }),
  payload: json(),
  status: lifecycle(['queued', 'sent', 'failed']),
  sentAt: timestamp(),
  waitlistEntry: relationship({ ref: 'WaitlistEntry.notifications' }),
}, 'canManageOrders', true);
