'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { Status } from '../../components/ui';

export function GuestSearch({ showId, q }: { showId: string; q: string }) {
  return <form method="get" className="flex gap-2">
    <input type="hidden" name="show" value={showId} />
    <input name="q" defaultValue={q} aria-label="Find guest" placeholder="Name, email or order number" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" autoComplete="off" />
    <button type="submit" className={pillClass + ' h-10 border'}>Find</button>
  </form>;
}

export function GuestTicketRow({ ticket, showId, orderNumber, orderName }: { ticket: { id: string; ticketCode: string; status: string; holderName: string }; showId: string; orderNumber: string; orderName: string }) {
  const router = useRouter(); const [message, setMessage] = React.useState(''); const [pending, start] = React.useTransition();
  const act = (op: string, vars: Record<string, unknown>) => start(async () => { const r = await runCommand(op, vars); if (!r.ok) setMessage(r.error); else { setMessage(''); router.refresh(); } });
  return <div className="flex min-w-0 flex-nowrap items-start justify-between gap-3 border-b py-3 text-sm last:border-b-0">
    <div className="min-w-0 flex-1 space-y-1">
      <div className="break-words"><span className="font-medium">{ticket.holderName || orderName}</span> <span className="text-xs text-muted-foreground">{orderNumber} · <span className="font-mono">{ticket.ticketCode}</span></span></div>
      <div className="flex flex-wrap items-center gap-2"><Status value={ticket.status} />
        {ticket.status === 'valid' ? <button className={pillClass} disabled={pending} onClick={() => act('checkInTicket', { tokenOrCode: ticket.ticketCode, showId, method: 'manual' })}>Check in</button> : null}
        {ticket.status === 'checked_in' ? <button className={pillClass} disabled={pending} onClick={() => act('undoCheckIn', { ticketId: ticket.id, showId, reason: 'Checked in by mistake' })}>Undo check-in</button> : null}
      </div>
      {message ? <p role="alert" className="text-xs">{message}</p> : null}
    </div>
  </div>;
}
