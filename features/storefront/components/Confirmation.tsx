'use client';

import * as React from 'react';
import { loadConfirmation } from '../lib/clientActions';
import { completeCheckout } from '../lib/actions';
import { price, showTime, ageLabel } from '../lib/format';
import { TransferTicket } from './TransferTicket';

/** QR codes are drawn from the opaque ticket token with a small inline encoder-free fallback: the code is also printed. */
export function Confirmation({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = React.useState<any>(null);
  const [error, setError] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const load = React.useCallback(async (s: string) => { const r = await loadConfirmation(orderNumber, s); if (r.ok) setOrder(r.order); }, [orderNumber]);
  React.useEffect(() => {
    const secret = window.location.hash.slice(1) || sessionStorage.getItem(`order:${orderNumber}`) || '';
    setSecret(secret);
    if (!secret) { setError('Open this page from your confirmation link, or use Find my order.'); return; }
    (async () => {
      let r = await loadConfirmation(orderNumber, secret);
      if (r.ok && r.order.status === 'pending_payment') { await completeCheckout(orderNumber, secret); r = await loadConfirmation(orderNumber, secret); }
      if (r.ok) setOrder(r.order); else setError(r.error);
    })();
  }, [orderNumber]);
  if (error) return <p role="alert" className="text-sm text-red-600">{error}</p>;
  if (!order) return <p className="text-sm text-muted-foreground">Loading</p>;
  const paid = ['paid', 'partially_refunded', 'comp'].includes(order.status);
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{paid ? 'Confirmed' : order.status.replace('_', ' ')}</p>
        <h1 className="mt-1 break-all font-mono text-2xl font-semibold sm:text-3xl" data-testid="order-number">{order.orderNumber}</h1>
        <p className="mt-2 text-sm">{order.show.title} · {showTime(order.show.startsAt)}</p>
        <p className="text-sm text-muted-foreground">{order.show.room?.name} · doors {showTime(order.show.doorsAt, 'time')} · {ageLabel(order.show.ageRestriction)}</p>
      </div>
      <section>
        <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">Tickets</h2>
        <ul>
          {order.tickets.map((t: any) => (
            <li key={t.ticketCode} className="flex flex-wrap items-center justify-between gap-2 border-b py-3 last:border-b-0">
              <span className="font-mono text-sm break-all">{t.ticketCode}</span>
              <span className="font-mono text-xs uppercase tracking-wide">{t.status.replace('_', ' ')}</span>
              {t.holderName && t.transferredFromCode ? <span className="w-full text-xs text-muted-foreground">Transferred to {t.holderName}</span> : null}
              {t.status === 'valid' ? <span className="w-full break-all font-mono text-xs text-muted-foreground" aria-label="Scan token">{t.token}</span> : null}
              {t.status === 'valid' && paid && new Date() < new Date(order.show.doorsAt || order.show.startsAt) ? <TransferTicket orderNumber={orderNumber} secret={secret} ticketCode={t.ticketCode} onDone={() => load(secret)} /> : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-1 text-sm">
        {order.lines.map((l: any) => <div key={l.tierName} className="flex justify-between gap-3"><span>{l.quantity} × {l.tierName}</span><span>{price(l.lineTotalCents)}</span></div>)}
        {order.discountCents ? <div className="flex justify-between"><span>Discount</span><span>−{price(order.discountCents)}</span></div> : null}
        <div className="flex justify-between"><span>Fees</span><span>{price(order.feesCents)}</span></div>
        <div className="flex justify-between"><span>Tax</span><span>{price(order.taxCents)}</span></div>
        <div className="flex justify-between border-t pt-2 font-medium"><span>Total</span><span>{price(order.totalCents)}</span></div>
      </section>
      <p className="text-sm text-muted-foreground">Show your ticket code at the door. Two-item minimum per guest applies at your table.</p>
    </div>
  );
}
