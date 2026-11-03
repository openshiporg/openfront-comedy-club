'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

type T = { id: string; label: string; seats: number; x: number; y: number; section: string; state: 'free' | 'held' | 'seated' };
type O = { id: string; name: string; partySize: number; orderNumber: string };

const STATE = { free: 'border-border bg-background', held: 'border-amber-500 bg-amber-500/10', seated: 'border-emerald-500 bg-emerald-500/15' } as const;

export function SeatingBoard({ showId, tables, orders }: { showId: string; tables: T[]; orders: O[] }) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>([]);
  const [orderId, setOrderId] = React.useState(orders[0]?.id || '');
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  const sections = Array.from(new Set(tables.map((t) => t.section)));
  const order = orders.find((o) => o.id === orderId);
  const seats = tables.filter((t) => picked.includes(t.id)).reduce((n, t) => n + t.seats, 0);

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s}>
            <div className="mb-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">{s}</div>
            <div className="flex flex-wrap gap-2">
              {tables.filter((t) => t.section === s).map((t) => (
                <button
                  key={t.id} type="button" disabled={t.state === 'seated'}
                  onClick={() => setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                  className={cn('flex size-14 flex-col items-center justify-center rounded-md border text-xs', STATE[t.state], picked.includes(t.id) && 'ring-2 ring-primary')}
                  aria-pressed={picked.includes(t.id)}
                >
                  <span className="font-mono font-semibold">{t.label}</span>
                  <span className="text-muted-foreground">{t.seats}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-border" />Free</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber-500" />Held</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-emerald-500" />Seated</span>
      </div>
      {orders.length ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
            {orders.map((o) => (
              <button key={o.id} type="button" onClick={() => setOrderId(o.id)} className={cn('rounded-md px-3 py-1.5 text-sm', o.id === orderId ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground')}>
                {o.name} · {o.partySize}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button" disabled={pending || !picked.length || !order || seats < order.partySize}
              className={pillClass + ' border'}
              onClick={() => start(async () => {
                setError('');
                const r = await runCommand('seatParty', { orderId, tableIds: picked, showId });
                if (!r.ok) setError(r.error); else { setPicked([]); router.refresh(); }
              })}
            >Seat party</button>
            <span className="text-xs text-muted-foreground">{seats} of {order?.partySize ?? 0} seats chosen</span>
          </div>
          {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
        </div>
      ) : <p className="text-sm text-muted-foreground">No parties waiting to be seated.</p>}
    </div>
  );
}
