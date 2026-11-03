export const price = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);
export const showTime = (iso: string, style: 'full' | 'time' = 'full') =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...(style === 'time' ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }).format(new Date(iso));
export const ageLabel = (a: string) => (a === 'all' ? 'All ages' : `${a}+`);
