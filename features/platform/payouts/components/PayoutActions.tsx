'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ActionButton, pillClass } from '../../components/ActionButton';
import { runCommand } from '../../actions/commands';
export function PayoutActions({ id, status }: { id: string; status: string }) {
  const router = useRouter(); const [method, setMethod] = React.useState('check'); const [reference, setReference] = React.useState(''); const [error, setError] = React.useState(''); const [pending, start] = React.useTransition();
  if (status === 'draft') return <ActionButton op="approvePayout" vars={{ payoutId: id }}>Approve payout</ActionButton>;
  if (status !== 'approved') return null;
  return <div className="w-full space-y-2"><p className="text-xs">Record a payment already made outside the platform.</p><div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">{['check','ach','venmo'].map(m => <button key={m} className={pillClass} aria-pressed={method === m} onClick={() => setMethod(m)}>{m.toUpperCase()}</button>)}</div>
    <input aria-label="Payment reference" placeholder="Payment reference" maxLength={200} value={reference} onChange={e => setReference(e.target.value)} className="h-11 w-full rounded-md border bg-background px-3 text-sm" />
    <button className={pillClass} disabled={pending || !reference.trim()} onClick={() => start(async () => { const r = await runCommand('recordPayoutPaid', { payoutId: id, method, reference }); if (!r.ok) setError(r.error); else router.refresh(); })}>Record paid</button>{error ? <p role="alert" className="text-xs">{error}</p> : null}
  </div>;
}
