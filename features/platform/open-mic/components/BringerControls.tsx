'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

export function BringerSignupForm({ showId }: { showId: string }) {
  const router = useRouter(); const [name, setName] = React.useState(''); const [email, setEmail] = React.useState(''); const [guests, setGuests] = React.useState(2);
  const [message, setMessage] = React.useState(''); const [pending, start] = React.useTransition();
  const cls = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
  return <div className="space-y-2 py-3">
    <p className="font-mono text-xs uppercase">Add bringer</p>
    <input aria-label="Bringer name" placeholder="Name" className={cls} value={name} onChange={e => setName(e.target.value)} />
    <input aria-label="Bringer email" type="email" placeholder="Email" className={cls} value={email} onChange={e => setEmail(e.target.value)} />
    <label className="block text-sm">Guests required<input type="number" min={1} max={20} className={cls} value={guests} onChange={e => setGuests(Number(e.target.value))} /></label>
    <button className={pillClass} disabled={pending || !name.trim() || !email.trim()} onClick={() => start(async () => {
      const r = await runCommand('addBringerSignup', { showId, name, email, guestsRequired: guests });
      setMessage(r.ok ? 'Bringer added' : r.error); if (r.ok) { setName(''); setEmail(''); router.refresh(); }
    })}>Add bringer</button>
    {message ? <p role="status" className="text-xs break-words">{message}</p> : null}
  </div>;
}

export function BringerArrival({ signupId }: { signupId: string }) {
  const router = useRouter(); const [message, setMessage] = React.useState(''); const [pending, start] = React.useTransition();
  return <span className="inline-flex flex-wrap items-center gap-2"><button className={pillClass} disabled={pending} onClick={() => start(async () => {
    const r = await runCommand('recordBringerArrival', { signupId, guests: 1 });
    if (r.ok) router.refresh(); else setMessage(r.error);
  })}>Guest arrived</button>{message ? <span role="alert" className="text-xs">{message}</span> : null}</span>;
}

const NEXT: Record<string, { status: string; label: string }[]> = {
  waiting: [{ status: 'called', label: 'Call up' }, { status: 'skipped', label: 'Skip' }],
  called: [{ status: 'performed', label: 'Done' }, { status: 'waiting', label: 'Back to list' }],
  skipped: [{ status: 'waiting', label: 'Back to list' }],
};
export function SignupActions({ signupId, status, drawn }: { signupId: string; status: string; drawn: boolean }) {
  const router = useRouter(); const [message, setMessage] = React.useState(''); const [pending, start] = React.useTransition();
  const options = (NEXT[status] || []).filter(o => o.status !== 'called' || drawn);
  if (!options.length) return null;
  return <span className="inline-flex flex-wrap items-center gap-2">{options.map(o => <button key={o.status} className={pillClass} disabled={pending} onClick={() => start(async () => {
    const r = await runCommand('setSignupStatus', { signupId, status: o.status });
    if (r.ok) { setMessage(''); router.refresh(); } else setMessage(r.error);
  })}>{o.label}</button>)}{message ? <span role="alert" className="text-xs">{message}</span> : null}</span>;
}
