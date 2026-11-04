'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

export function PromoLimitForm({ promoId, current }: { promoId: string; current: number }) {
  const router = useRouter(); const [value, setValue] = React.useState(current); const [message, setMessage] = React.useState(''); const [pending, start] = React.useTransition();
  return <div className="space-y-2">
    <label className="block text-sm">Discounted tickets per order<input type="number" min={1} max={20} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={e => setValue(Number(e.target.value))} /></label>
    <p className="text-xs text-muted-foreground">Only this many tickets in one order receive the discount. The rest are full price.</p>
    <button className={pillClass} disabled={pending || value === current || !Number.isInteger(value) || value < 1 || value > 20} onClick={() => start(async () => {
      const r = await runCommand('updatePromoLimit', { promoId, perOrderLimit: value });
      setMessage(r.ok ? 'Limit saved' : r.error); if (r.ok) router.refresh();
    })}>Save limit</button>
    {message ? <p role="status" className="text-xs break-words">{message}</p> : null}
  </div>;
}
