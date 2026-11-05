'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

type T = { id: string; label: string; seats: number; x: number; y: number; section: string; state: 'free' | 'held' | 'seated' };
type O = { id: string; name: string; partySize: number; orderNumber: string };
type S = { id: string; name: string; partySize: number; orderNumber: string; tableIds: string[]; tableLabels: string[]; openCheck: boolean };

const STATE = { free: 'border-border bg-background', held: 'border-amber-500 bg-amber-500/10', seated: 'border-emerald-500 bg-emerald-500/15' } as const;

export function SeatingBoard({ showId, tables, orders, seated = [] }: { showId: string; tables: T[]; orders: O[]; seated?: S[] }) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>([]);
  const [orderId, setOrderId] = React.useState('');
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  const [partyId, setPartyId] = React.useState('');
  const party = seated.find((x) => x.id === partyId);
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
                  key={t.id} type="button" disabled={t.state === 'seated' && !seated.some((x) => x.tableIds.includes(t.id))}
                  onClick={() => {
                    // a seated table opens its party; while a party is open, free tables are picked as its new place
                    const at = seated.find((x) => x.tableIds.includes(t.id));
                    if (at && at.id !== partyId) { setPartyId(at.id); setPicked([]); setError(''); return; }
                    if (at) return;
                    setPicked((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]));
                  }}
                  className={cn('flex size-14 flex-col items-center justify-center rounded-md border text-xs', STATE[t.state], (picked.includes(t.id) || party?.tableIds.includes(t.id)) && 'ring-2 ring-primary')}
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
      {party ? (
        <div className="space-y-2 rounded-lg border p-3" data-testid="seated-party">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-words text-sm"><span className="font-medium">{party.name}</span> <span className="text-xs text-muted-foreground">party of {party.partySize} · {party.tableLabels.join(', ')}{party.orderNumber ? <> · <span className="font-mono">#{shortCode(party.orderNumber)}</span></> : null}</span></span>
            <button type="button" className={pillClass} onClick={() => { setPartyId(''); setPicked([]); setError(''); }}>Done</button>
          </div>
          <p className="text-xs text-muted-foreground">Pick free tables to move the party there.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending || !picked.length || seats < party.partySize} className={pillClass + ' border'}
              onClick={() => start(async () => { setError(''); const r = await runCommand('moveParty', { assignmentId: party.id, tableIds: picked }); if (!r.ok) setError(r.error); else { setPicked([]); setPartyId(''); router.refresh(); } })}>Move party</button>
            <button type="button" disabled={pending || party.openCheck} className={pillClass + ' border'}
              onClick={() => { if (!window.confirm(`Unseat ${party.name} and free ${party.tableLabels.join(', ')}?`)) return; start(async () => { setError(''); const r = await runCommand('unseatParty', { assignmentId: party.id }); if (!r.ok) setError(r.error); else { setPicked([]); setPartyId(''); router.refresh(); } }); }}>Unseat</button>
            <span className="text-xs text-muted-foreground">{picked.length ? `${seats} of ${party.partySize} seats chosen` : party.openCheck ? 'Open check: move only' : ''}</span>
          </div>
          {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
        </div>
      ) : orders.length ? (
        <div className="space-y-2 rounded-lg border p-3">
          <PartyPicker orders={orders} orderId={orderId} onPick={setOrderId} />
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

const shortCode = (n: string) => n.slice(-6);
/** Search-first: find a waiting party by name, order code or size; shows the code so same-named parties are distinguishable. */
function PartyPicker({ orders, orderId, onPick }: { orders: O[]; orderId: string; onPick: (id: string) => void }) {
  const [term, setTerm] = React.useState('');
  const chosen = orders.find((o) => o.id === orderId);
  const t = term.trim().toLowerCase();
  const matches = orders.filter((o) => !t || o.name.toLowerCase().includes(t) || o.orderNumber.toLowerCase().includes(t) || `party of ${o.partySize}` === t || String(o.partySize) === t);
  const shown = matches.slice(0, 6);
  if (chosen && !term) return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-words text-sm"><span className="font-medium">{chosen.name}</span> <span className="text-xs text-muted-foreground">party of {chosen.partySize} · <span className="font-mono">#{shortCode(chosen.orderNumber)}</span></span></span>
      <button type="button" className={pillClass} onClick={() => onPick('')}>Change</button>
    </div>
  );
  return (
    <div className="space-y-2">
      <input aria-label="Find waiting party" placeholder={`Find one of ${orders.length} waiting parties by name or order code`} value={term} onChange={(e) => setTerm(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" autoComplete="off" />
      <div role="listbox" aria-label="Waiting parties" className="divide-y rounded-md border">
        {shown.length ? shown.map((o) => (
          <button key={o.id} type="button" role="option" aria-selected={o.id === orderId} onClick={() => { onPick(o.id); setTerm(''); }} className="flex w-full min-w-0 flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left text-sm">
            <span className="min-w-0 break-words font-medium">{o.name}</span>
            <span className="text-xs text-muted-foreground">party of {o.partySize} · <span className="font-mono">#{shortCode(o.orderNumber)}</span></span>
          </button>
        )) : <p className="px-3 py-2 text-sm text-muted-foreground">No waiting party matches.</p>}
      </div>
      {matches.length > shown.length ? <p className="text-xs text-muted-foreground">{matches.length - shown.length} more. Keep typing to narrow.</p> : null}
    </div>
  );
}
