'use client';

import * as React from 'react';
import { transferTicket } from '../lib/actions';

const field = 'h-11 w-full rounded-md border bg-background px-3 text-sm';
const btn = 'inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50';

/** Buyer-side transfer of one ticket. The server re-checks everything; this only gathers the new holder. */
export function TransferTicket({ orderNumber, secret, ticketCode, onDone }: { orderNumber: string; secret: string; ticketCode: string; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', email: '' });
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  if (!open) return <button type="button" className={btn + ' h-11 bg-background'} onClick={() => setOpen(true)}>Transfer</button>;
  return (
    <form className="w-full space-y-2 pt-1" onSubmit={(e) => { e.preventDefault(); start(async () => {
      setError(''); const r = await transferTicket({ orderNumber, orderSecret: secret, ticketCode, name: form.name, email: form.email });
      if (!r.ok) { setError(r.error); return; }
      onDone();
    }); }}>
      <p className="text-xs text-muted-foreground">The new holder gets their own ticket code. This ticket stops working immediately.</p>
      <input className={field} placeholder="New holder's name" autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input className={field} type="email" placeholder="New holder's email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btn + ' bg-foreground text-background'}>{pending ? 'Transferring' : 'Transfer ticket'}</button>
        <button type="button" disabled={pending} className={btn + ' bg-background'} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
