'use client';

import * as React from 'react';
import { loadConfirmation } from '../lib/clientActions';
import { completeCheckout } from '../lib/actions';
import { price, ageLabel } from '../lib/format';
import { useShowTime } from './VenueTime';
import { TransferTicket } from './TransferTicket';
import { TicketQr } from './TicketQr';

/** Each valid ticket shows a QR code of its opaque scan token; the ticket code is printed too, for typing at the door. */
export function Confirmation({ orderNumber }: { orderNumber: string }) {
  const showTime = useShowTime();
  const [order, setOrder] = React.useState<any>(null);
  const [error, setError] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const load = React.useCallback(async (s: string) => { const r = await loadConfirmation(orderNumber, s); if (r.ok) setOrder(r.order); }, [orderNumber]);
  React.useEffect(() => {
    const secret = window.location.hash.slice(1) || sessionStorage.getItem(`order:${orderNumber}`) || '';
    setSecret(secret);
    if (!secret) { setError('This link is incomplete. Open the tickets email, or use Find my order with your email and order number.'); return; }
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{order.show.title}</h1>
        <p className="mt-2 text-sm">{showTime(order.show.startsAt, 'date')}</p>
        <p className="text-sm text-muted-foreground">{[order.show.doorsAt ? `Doors ${showTime(order.show.doorsAt, 'time')}` : '', `Show ${showTime(order.show.startsAt, 'time')}`, order.show.room?.name, ageLabel(order.show.ageRestriction)].filter(Boolean).join(' · ')}</p>
        <p className="mt-3 text-sm">Order number <span className="break-all font-mono font-medium" data-testid="order-number">{order.orderNumber}</span></p>
        {paid ? <p className="mt-1 text-sm text-muted-foreground">Your tickets and this order number are on their way to your email.</p> : null}
      </div>
      <section>
        <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">Tickets</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {order.tickets.map((t: any, i: number) => (
            <li key={t.ticketCode} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-neutral-200 p-3 has-[form]:col-span-full">
              <span className="flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-wide"><span>Ticket {i + 1}</span><span className="text-muted-foreground">{t.status.replace('_', ' ')}</span></span>
              {t.status === 'valid' && paid && t.token ? <TicketQr token={t.token} label={`QR code for ticket ${t.ticketCode}`} className="aspect-square h-auto w-full" /> : null}
              <span className="break-all font-mono text-xs">{t.ticketCode}</span>
              {t.holderName && t.transferredFromCode ? <span className="text-xs text-muted-foreground">Transferred to {t.holderName}</span> : null}
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
      <p className="text-sm text-muted-foreground">Show the QR code or your ticket code at the door. Two-item minimum per guest applies at your table.</p>
    </div>
  );
}
