'use client';

import * as React from 'react';
import { answerSlot, loadSlotInvite } from '../lib/actions';
import { price, showTime } from '../lib/format';

const btn = 'inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50';

/** The emailed link carries the token in the fragment, so it never reaches a server log. */
export function SlotResponse({ slotId }: { slotId: string }) {
  const [token, setToken] = React.useState('');
  const [state, setState] = React.useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; o: any }>({ kind: 'loading' });
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const refresh = React.useCallback((t: string) => loadSlotInvite(slotId, t).then((r) => setState(r.ok ? { kind: 'ok', o: r.data } : { kind: 'error', message: r.error })), [slotId]);
  React.useEffect(() => {
    const t = window.location.hash.slice(1);
    if (!t) { setState({ kind: 'error', message: 'This link is incomplete. Open it again from your email.' }); return; }
    setToken(t); refresh(t);
  }, [refresh]);
  if (state.kind === 'loading') return <p className="text-sm text-muted-foreground">Checking your link.</p>;
  if (state.kind === 'error') return <p role="alert" className="text-sm">{state.message === 'Not found' ? 'This link was not found.' : state.message}</p>;
  const o = state.o;
  const row = (k: string, v: string) => (<div className="flex justify-between gap-4 border-b py-2 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v}</dd></div>);
  const answer = (response: 'confirm' | 'decline') => start(async () => {
    setError(''); const r = await answerSlot(slotId, token, response);
    if (!r.ok) { setError(r.error); return; }
    await refresh(token);
  });
  return (
    <div className="space-y-4">
      <p className="text-sm">Hi {o.comedian}, here are the terms for <span className="font-medium">{o.title}</span>.</p>
      <dl>
        {row('Show', showTime(o.startsAt))}
        {o.doorsAt ? row('Doors', showTime(o.doorsAt, 'time')) : null}
        {o.room ? row('Room', o.room) : null}
        {row('Role', String(o.role).replaceAll('_', ' '))}
        {row('Set length', `${o.setMinutes} min`)}
        {row('Fee', price(o.feeCents))}
        {o.bonusCents ? row('Bonus', price(o.bonusCents)) : null}
        {row('Total pay', price(o.totalCents))}
      </dl>
      {o.canRespond ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} className={btn + ' bg-foreground text-background'} onClick={() => answer('confirm')}>Confirm slot</button>
          <button type="button" disabled={pending} className={btn + ' bg-background'} onClick={() => answer('decline')}>Decline</button>
        </div>
      ) : (
        <p role="status" className="font-mono text-xs uppercase tracking-wide">{o.status === 'confirmed' ? 'You confirmed this slot' : o.status === 'declined' ? 'You declined this slot' : `Slot ${String(o.status).replaceAll('_', ' ')}. Contact the venue to change it`}</p>
      )}
      {error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
