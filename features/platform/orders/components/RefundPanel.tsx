'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

export function RefundPanel({ orderId, remainingTickets }: { orderId: string; remainingTickets: { id: string; code: string }[] }) {
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [approval, setApproval] = React.useState('');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [msg, setMsg] = React.useState('');
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {remainingTickets.map((t) => (
          <button key={t.id} type="button" aria-pressed={picked.includes(t.id)} onClick={() => setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))} className={`rounded-md border px-2 py-1 font-mono text-xs ${picked.includes(t.id) ? 'border-primary bg-primary/10' : ''}`}>{t.code}</button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{picked.length ? `${picked.length} tickets selected` : 'No tickets selected refunds every remaining ticket.'}</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
      <input value={approval} onChange={(e) => setApproval(e.target.value)} placeholder="Approval ID (needed above the threshold)" className="h-10 w-full rounded-md border bg-background px-3 font-mono text-sm" />
      <button type="button" disabled={pending || !reason.trim()} className={pillClass + ' border'} onClick={() => start(async () => {
        setMsg('');
        const r = await runCommand('refundTicketOrder', { orderId, reason, ticketIds: picked.length ? picked : undefined, approvalId: approval || undefined });
        if (!r.ok) setMsg(r.error); else { setMsg(`Refund ${r.data?.status}`); router.refresh(); }
      })}>Refund</button>
      {msg ? <p role="status" className="break-words text-xs">{msg}</p> : null}
    </div>
  );
}
