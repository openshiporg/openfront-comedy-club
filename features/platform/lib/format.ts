export const money = (cents: number | null | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents ?? 0) / 100);

export function when(iso: string | null | undefined, tz = 'America/Chicago', style: 'full' | 'time' | 'day' = 'full') {
  if (!iso) return '';
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions =
    style === 'time' ? { hour: 'numeric', minute: '2-digit' }
    : style === 'day' ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(d);
}

export const label = (value: string | null | undefined) => (value || '').replaceAll('_', ' ');
