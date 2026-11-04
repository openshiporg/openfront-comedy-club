import { zonedTime } from './time';

export const REMINDER_WINDOW_HOURS = 48;
const HOUR = 3600e3;

const dayIn = (d: Date, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const timeIn = (d: Date, tz: string) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);

/** 9:00 venue time on show day; never later than 3h before the show, never in the past. */
export function reminderSendAfter(startsAt: Date, tz: string, now: Date) {
  const nine = zonedTime(dayIn(startsAt, tz), '09:00', tz);
  const latest = new Date(startsAt.getTime() - 3 * HOUR);
  const at = nine < latest ? nine : latest;
  return at < now ? now : at;
}

/** Shows that start after now and within the window get reminders queued; earlier or later ones do not. */
export function inReminderWindow(startsAt: Date, now: Date) {
  return startsAt > now && startsAt.getTime() - now.getTime() <= REMINDER_WINDOW_HOURS * HOUR;
}

export const showReminderKey = (orderId: string) => `show_reminder:${orderId}`;
export const lineupConfirmationKey = (slotId: string) => `lineup_confirmation:${slotId}`;

export function showReminderMessage(o: { name: string; partySize: number; orderNumber: string }, show: { title: string; startsAt: Date; doorsAt: Date | null }, tz: string, venueName: string) {
  const doors = show.doorsAt ? ` Doors open ${timeIn(show.doorsAt, tz)}.` : '';
  return {
    subject: `Tonight: ${show.title}`,
    body: `Hi ${o.name || 'there'}, a reminder that ${show.title}${venueName ? ' at ' + venueName : ''} starts ${timeIn(show.startsAt, tz)}.${doors} Your party of ${o.partySize} is booked under order ${o.orderNumber}. Bring this email or your ticket QR code to the door.`,
  };
}

export function lineupConfirmationMessage(c: { name: string }, show: { title: string; startsAt: Date }, slot: { role: string; setMinutes: number }, tz: string, venueName: string) {
  return {
    subject: `Confirmed: ${show.title}`,
    body: `Hi ${c.name || 'there'}, you are confirmed as ${slot.role.replaceAll('_', ' ')} (${slot.setMinutes} min) on ${show.title}${venueName ? ' at ' + venueName : ''}, ${timeIn(show.startsAt, tz)}. Reply to the venue if anything changes.`,
  };
}
