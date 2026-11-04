'use client';
import * as React from 'react';
import { runCommand, findApproval } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

/** Resolves exact, unexpired approval for the current actor; never accepts pasted IDs. */
export function ApprovalControl({ actionType, targetId, amount, reason, onApproval }: { actionType: string; targetId: string; amount?: number | null; reason: string; onApproval: (id: string) => void }) {
  const [message, setMessage] = React.useState('');
  const [pending, start] = React.useTransition();
  React.useEffect(() => { onApproval(''); setMessage(''); }, [actionType, targetId, amount, reason, onApproval]);
  return <div className="space-y-2"><div className="flex flex-wrap gap-2 rounded-lg bg-muted p-1">
    <button className={pillClass} disabled={pending || !reason.trim()} onClick={() => start(async () => {
      const r = await runCommand('requestApproval', { actionType, targetId, amount: amount ?? null, reason });
      setMessage(r.ok ? 'Requested. An independent manager must approve in Approvals.' : r.error);
    })}>Request approval</button>
    <button className={pillClass} disabled={pending || !reason.trim()} onClick={() => start(async () => {
      const r = await findApproval({ actionType, targetId, amount: amount ?? null, reason });
      onApproval(r.id || ''); setMessage(r.id ? 'Approval ready' : r.error || 'No matching approval');
    })}>Check approval</button>
  </div><a href="/dashboard/platform/approvals" className="text-sm underline">Approvals</a>{message ? <p role="status" className="text-xs break-words">{message}</p> : null}</div>;
}
