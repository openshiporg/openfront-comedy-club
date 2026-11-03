'use client';

import * as React from 'react';
import { micSignup } from '../lib/actions';
import { showTime } from '../lib/format';

const input = 'h-10 w-full rounded-md border bg-background px-3 text-sm';
export function OpenMicForm({ shows }: { shows: { id: string; title: string; startsAt: string; signupOpensAt: string | null }[] }) {
  return <div className="space-y-8">{shows.map((s) => <One key={s.id} show={s} />)}</div>;
}
function One({ show }: { show: { id: string; title: string; startsAt: string; signupOpensAt: string | null } }) {
  const [name, setName] = React.useState(''); const [email, setEmail] = React.useState(''); const [msg, setMsg] = React.useState(''); const [pending, start] = React.useTransition();
  const opens = show.signupOpensAt ? new Date(show.signupOpensAt) : null;
  const closed = !opens || opens.getTime() > Date.now();
  return (
    <section className="space-y-3 border-b pb-6 last:border-b-0">
      <h2 className="font-medium">{show.title} <span className="text-sm font-normal text-muted-foreground">{showTime(show.startsAt)}</span></h2>
      {closed ? <p className="text-sm text-muted-foreground">Signup opens {opens ? showTime(show.signupOpensAt!) : 'soon'}.</p> : (
        <>
          <label className="block text-sm">Stage name<input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block text-sm">Email<input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button type="button" className="inline-flex h-10 items-center rounded-md border bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50" disabled={pending || !name || !email} onClick={() => start(async () => { const r = await micSignup({ showId: show.id, name, email }); setMsg(r.ok ? 'You are on the list.' : r.error); })}>Sign up</button>
        </>
      )}
      {msg ? <p role="status" className="text-sm">{msg}</p> : null}
    </section>
  );
}
