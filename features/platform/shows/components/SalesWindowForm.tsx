'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { zonedTime } from '../../../keystone/lib/time';

/** ISO instant to a datetime-local value in the venue zone. */
function toLocal(iso: string | null, tz: string) {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const toInstant = (local: string, tz: string) => (local ? zonedTime(local.slice(0, 10), local.slice(11, 16), tz).toISOString() : '');

export function SalesWindowForm({ tierId, tz, start, end }: { tierId: string; tz: string; start: string | null; end: string | null }) {
  const router = useRouter(); const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(toLocal(start, tz)); const [to, setTo] = React.useState(toLocal(end, tz));
  const [message, setMessage] = React.useState(''); const [pending, start_] = React.useTransition();
  const cls = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Schedule sales</button>;
  return <div className="w-full space-y-2 py-2">
    <label className="block text-sm">On sale at<input type="datetime-local" className={cls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
    <label className="block text-sm">Off sale at<input type="datetime-local" className={cls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
    <p className="text-xs text-muted-foreground">Venue time. Leave a field empty for no limit.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={pillClass} disabled={pending} onClick={() => start_(async () => {
        const r = await runCommand('setSalesWindow', { tierId, salesStartAt: toInstant(from, tz), salesEndAt: toInstant(to, tz) });
        if (r.ok) { setMessage('Saved'); setOpen(false); router.refresh(); } else setMessage(r.error);
      })}>Save schedule</button>
      <button type="button" className={pillClass} onClick={() => setOpen(false)}>Close</button>
    </div>
    {message ? <p role="status" className="break-words text-xs">{message}</p> : null}
  </div>;
}
