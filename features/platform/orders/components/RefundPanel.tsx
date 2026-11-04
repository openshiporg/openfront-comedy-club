'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { ApprovalControl } from '../../approvals/components/ApprovalControl';

export function RefundPanel({ orderId, remainingTickets, totalCents, ticketCount, remainingCents, threshold }: { orderId: string; remainingTickets: { id: string; code: string }[]; totalCents: number; ticketCount: number; remainingCents: number; threshold: number }) {
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [approval, setApproval] = React.useState('');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [msg, setMsg] = React.useState('');
  const [pending, start] = React.useTransition();
  const amount = !picked.length || picked.length === remainingTickets.length ? remainingCents : Math.floor(totalCents * picked.length / ticketCount);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {remainingTickets.map((t) => (
          <button key={t.id} type="button" aria-pressed={picked.includes(t.id)} onClick={() => setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))} className={`rounded-md border px-2 py-1 font-mono text-xs ${picked.includes(t.id) ? 'border-primary bg-primary/10' : ''}`}>{t.code}</button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{picked.length ? `${picked.length} tickets selected` : 'No tickets selected refunds every remaining ticket.'}</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
      <p className="text-sm">Refund amount: ${(amount / 100).toFixed(2)}</p>
      {amount > threshold ? <ApprovalControl actionType="refund_payment" targetId={orderId} amount={amount} reason={reason} onApproval={setApproval} /> : null}
      <button type="button" disabled={pending || !reason.trim() || amount < 1 || (amount > threshold && !approval)} className={pillClass + ' border'} onClick={() => start(async () => {
        setMsg('');
        const r = await runCommand('refundTicketOrder', { orderId, reason, ticketIds: picked.length ? picked : undefined, approvalId: approval || undefined });
        if (!r.ok) setMsg(r.error); else { setMsg(`Refund ${r.data?.status}`); router.refresh(); }
      })}>Refund</button>
      {msg ? <p role="status" className="break-words text-xs">{msg}</p> : null}
    </div>
  );
}
