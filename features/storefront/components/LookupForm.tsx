'use client';

import * as React from 'react';
import { lookupOrder } from '../lib/clientActions';
import { cancelOrder } from '../lib/actions';
import { price } from '../lib/format';
import { useShowTime } from './VenueTime';
import { btnPrimary, inputCls } from './ui';


export function LookupForm() {
  const showTime = useShowTime();
  const [email, setEmail] = React.useState(''); const [number, setNumber] = React.useState('');
  const [order, setOrder] = React.useState<any>(null); const [msg, setMsg] = React.useState(''); const [pending, start] = React.useTransition();
  return (
    <div className="space-y-4">
      <label className="block text-sm">Email<input className={inputCls} type="email" inputMode="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="block text-sm">Order number<input className={inputCls + ' font-mono uppercase'} autoCapitalize="characters" autoCorrect="off" spellCheck={false} value={number} onChange={(e) => setNumber(e.target.value)} /></label>
      <button type="button" className={btnPrimary} disabled={pending || !email || !number} onClick={() => start(async () => { setMsg(''); const r = await lookupOrder(email, number); if (r.ok) setOrder(r.order); else { setOrder(null); setMsg(r.error); } })}>Find order</button>
      {msg ? <p role="alert" className="text-sm text-red-600">{msg}</p> : null}
      {order ? (
        <div className="space-y-3 border-t pt-4">
          <p className="font-mono text-xs uppercase tracking-wide">{order.status.replace('_', ' ')}</p>
          <p className="text-sm">{order.show.title} · {showTime(order.show.startsAt)}</p>
          <ul>{order.tickets.map((t: any) => <li key={t.ticketCode} className="flex justify-between gap-3 py-1"><span className="font-mono text-sm break-all">{t.ticketCode}</span><span className="font-mono text-xs uppercase">{t.status.replace('_', ' ')}</span></li>)}</ul>
          <p className="text-sm">Total {price(order.totalCents)}</p>
          {['paid', 'partially_refunded'].includes(order.status) ? <button type="button" className="h-11 rounded-full border px-4 text-sm" disabled={pending} onClick={() => start(async () => { const r = await cancelOrder(order.orderNumber, email); setMsg(r.ok ? 'Order cancelled and refunded.' : r.error); if (r.ok) { const f = await lookupOrder(email, number); if (f.ok) setOrder(f.order); } })}>Cancel order</button> : null}
        </div>
      ) : null}
    </div>
  );
}
