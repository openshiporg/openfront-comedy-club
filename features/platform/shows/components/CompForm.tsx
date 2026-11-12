'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { ApprovalControl } from '../../approvals/components/ApprovalControl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import { ClientOnly } from '../../components/ClientOnly';

export function CompForm({ showId, tiers, threshold }: { showId: string; tiers: { id: string; name: string }[]; threshold: number }) {
  const router = useRouter();
  const [tier, setTier] = React.useState(tiers[0]?.id || '');
  const [name, setName] = React.useState(''); const [email, setEmail] = React.useState('');
  const [quantity, setQuantity] = React.useState(1); const [reason, setReason] = React.useState('comic_guest');
  const [approvalId, setApproval] = React.useState(''); const [message, setMessage] = React.useState('');
  const [pending, start] = React.useTransition();
  const cls = 'h-11 w-full rounded-md border bg-background px-3 text-sm';
  return <div className="space-y-3">
    <ClientOnly placeholder={<button className={pillClass}>Choose tier</button>}><Popover><PopoverTrigger asChild><button className={pillClass}>{tiers.find(t => t.id === tier)?.name || 'Choose tier'}</button></PopoverTrigger><PopoverContent><Command><CommandList>{tiers.map(t => <CommandItem key={t.id} onSelect={() => setTier(t.id)}>{t.name}</CommandItem>)}</CommandList></Command></PopoverContent></Popover></ClientOnly>
    <label className="block text-sm">Recipient<input aria-label="Comp recipient" className={cls} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="block text-sm">Email<input type="email" className={cls} value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label className="block text-sm">Tickets<input type="number" min={1} max={20} className={cls} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">{['industry','comic_guest','press','service_recovery'].map(r => <button key={r} aria-pressed={reason === r} className={pillClass} onClick={() => setReason(r)}>{r.replaceAll('_',' ')}</button>)}</div>
    {quantity > threshold ? <ApprovalControl actionType="comp_tickets" targetId={showId} amount={quantity} reason={reason} onApproval={setApproval} /> : null}
    <button disabled={pending || !name.trim() || !tier || (quantity > threshold && !approvalId)} className={pillClass} onClick={() => start(async () => {
      const r = await runCommand('issueComp', { showId, tierId: tier, recipientName: name, recipientEmail: email, quantity, reason, approvalId: approvalId || undefined });
      setMessage(r.ok ? `Comp issued: ${r.data.orderNumber}` : r.error); if (r.ok) { setApproval(''); router.refresh(); }
    })}>Issue comp</button>
    {message ? <p role="status" className="text-xs break-words">{message}</p> : null}
  </div>;
}
