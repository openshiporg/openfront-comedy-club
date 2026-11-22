export const price = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
/** Used only until the venue's own time zone is read (Venue.timezone). */
export const DEFAULT_TIME_ZONE = 'America/Chicago';
export type TimeStyle = 'full' | 'time' | 'short' | 'day' | 'date';
const STYLES: Record<TimeStyle, Intl.DateTimeFormatOptions> = {
  full: { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  date: { weekday: 'long', month: 'long', day: 'numeric' },
  short: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  day: { weekday: 'short', month: 'short', day: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
};
/** Every storefront time goes through here, in the venue's time zone. */
export const showTime = (iso: string, style: TimeStyle = 'full', timeZone: string = DEFAULT_TIME_ZONE) =>
  new Intl.DateTimeFormat('en-US', { timeZone, ...STYLES[style] }).format(new Date(iso));
export const ageLabel = (a: string) => (a === 'all' ? 'All ages' : `${a}+`);
