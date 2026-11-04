'use client';

import * as React from 'react';
import { loadHolderTicket } from '../lib/actions';
import { ageLabel, showTime } from '../lib/format';

/** The scan token travels in the URL fragment, so it never reaches a server log. */
export function HolderTicket({ ticketCode }: { ticketCode: string }) {
  const [state, setState] = React.useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; t: any }>({ kind: 'loading' });
  const [token, setToken] = React.useState('');
  React.useEffect(() => {
    const t = window.location.hash.slice(1);
    if (!t) { setState({ kind: 'error', message: 'This link is incomplete. Open it again from your email.' }); return; }
    setToken(t);
    loadHolderTicket(ticketCode, t).then((r) => setState(r.ok ? { kind: 'ok', t: r.data } : { kind: 'error', message: r.error === 'Not found' ? 'This ticket was not found.' : r.error }));
  }, [ticketCode]);
  if (state.kind === 'loading') return <p className="text-sm text-muted-foreground">Loading your ticket.</p>;
  if (state.kind === 'error') return <p role="alert" className="text-sm">{state.message}</p>;
  const t = state.t;
  if (t.transferred) return <p role="status" className="font-mono text-xs uppercase tracking-wide">This ticket was transferred to someone else and no longer works</p>;
  const label: Record<string, string> = { valid: 'Valid', checked_in: 'Checked in', refunded: 'Refunded', void: 'Void' };
  const row = (k: string, v: string) => (<div className="flex justify-between gap-4 border-b py-2 text-sm"><dt className="shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v}</dd></div>);
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground" data-testid="ticket-status">{label[t.status] || t.status}</p>
        <p className="mt-1 break-all font-mono text-2xl font-semibold">{t.ticketCode}</p>
        <p className="mt-2 text-sm">{t.show.title} · {showTime(t.show.startsAt)}</p>
        <p className="text-sm text-muted-foreground">{t.show.room?.name} · doors {showTime(t.show.doorsAt || t.show.startsAt, 'time')} · {ageLabel(t.show.ageRestriction)}</p>
      </div>
      <dl>
        {row('Holder', t.holderName)}
        {t.holderEmail ? row('Email', t.holderEmail) : null}
        {row('Order', t.orderNumber)}
        {row('Seating', t.seating ? t.seating.tables.join(', ') : 'Assigned at the door')}
        {t.checkedInAt ? row('Checked in', showTime(t.checkedInAt, 'time')) : null}
      </dl>
      {t.status === 'valid' ? <p className="break-all font-mono text-xs text-muted-foreground" aria-label="Scan token">{token}</p> : null}
      {t.history.length ? (
        <section>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">Transfer history</h2>
          <ul>{t.history.map((h: any, i: number) => <li key={i} className="border-b py-2 text-sm last:border-b-0">{h.name} <span className="text-muted-foreground">gave this ticket on</span> {h.at ? showTime(h.at) : ''}</li>)}<li className="py-2 text-sm font-medium">{t.holderName} <span className="font-normal text-muted-foreground">holds it now</span></li></ul>
        </section>
      ) : null}
    </div>
  );
}
