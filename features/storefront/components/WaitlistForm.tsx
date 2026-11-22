'use client';

import * as React from 'react';
import { joinWaitlist } from '../lib/actions';
import { btnPrimary, inputCls } from './ui';


export function WaitlistForm({ showId, title }: { showId: string; title: string }) {
  const [form, setForm] = React.useState({ name: '', email: '', size: 2 });
  const [done, setDone] = React.useState<number | null>(null);
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  if (done !== null) return <p role="status" className="text-sm">You are number {done} on the waitlist for {title}. If seats open up, the box office will send you a link that holds them for a short time.</p>;
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Waitlist</h2>
      <p className="text-sm text-muted-foreground">No tickets left for a party this size. Join the line and we will hold seats for you if some come back.</p>
      <label className="block text-sm">Name<input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
      <label className="block text-sm">Email<input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
      <div className="flex items-center gap-3">
        <span className="text-sm">Party of</span>
        <button type="button" aria-label="Fewer" className="min-h-11 min-w-12 rounded-full border px-2 py-2 text-sm" onClick={() => setForm({ ...form, size: Math.max(1, form.size - 1) })}>−</button>
        <span className="w-6 text-center font-mono">{form.size}</span>
        <button type="button" aria-label="More" className="min-h-11 min-w-12 rounded-full border px-2 py-2 text-sm" onClick={() => setForm({ ...form, size: Math.min(20, form.size + 1) })}>+</button>
      </div>
      <button type="button" className={btnPrimary} disabled={pending || !form.name.trim() || !form.email.trim()} onClick={() => start(async () => {
        setError(''); const r = await joinWaitlist({ showId, name: form.name, email: form.email, partySize: form.size });
        if (r.ok) setDone(r.data.position); else setError(r.error);
      })}>{pending ? 'Joining' : 'Join the waitlist'}</button>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
