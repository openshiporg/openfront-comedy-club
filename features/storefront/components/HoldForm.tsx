'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createHold } from '../lib/actions';
import { price } from '../lib/format';

type Tier = { id: string; name: string; priceCents: number; feeCents: number; capacity: number; sold: number; held: number; status: string; isTableTier: boolean };
type Section = { name: string; tables: { id: string; label: string; seats: number; taken: boolean }[] };

const btn = 'inline-flex h-10 items-center justify-center rounded-md border bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50';
const chip = (on: boolean, off?: boolean) => `min-w-12 rounded-md border px-2 py-2 text-sm ${on ? 'border-foreground bg-foreground text-background' : ''} ${off ? 'opacity-40' : ''}`;

export function HoldForm({ showId, ageRestriction, tiers, sections }: { showId: string; ageRestriction: string; tiers: Tier[]; sections: Section[] }) {
  const router = useRouter();
  const open = tiers.filter((t) => t.status === 'on_sale' && t.sold + t.held < t.capacity);
  const [tierId, setTier] = React.useState(open[0]?.id || '');
  const [qty, setQty] = React.useState(2);
  const [tableIds, setTables] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  const tier = tiers.find((t) => t.id === tierId);
  const tableMode = Boolean(tier?.isTableTier && sections.length);
  const section = sections.find((s) => s.name === tier?.name);
  const seats = section ? section.tables.filter((t) => tableIds.includes(t.id)).reduce((n, t) => n + t.seats, 0) : 0;
  const quantity = tableMode ? seats : qty;
  const left = tier ? tier.capacity - tier.sold - tier.held : 0;

  if (!open.length) return <p className="text-sm text-muted-foreground">Sold out.</p>;
  return (
    <section className="space-y-5">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Tickets</h2>
      <div className="space-y-2">
        {open.map((t) => (
          <label key={t.id} className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${t.id === tierId ? 'border-foreground' : ''}`}>
            <span className="flex items-center gap-3">
              <input type="radio" name="tier" checked={t.id === tierId} onChange={() => { setTier(t.id); setTables([]); }} />
              <span className="font-medium">{t.name}</span>
            </span>
            <span className="text-sm">{price(t.priceCents)} <span className="text-muted-foreground">+ {price(t.feeCents)} fee</span></span>
          </label>
        ))}
      </div>
      {tableMode && section ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Choose your tables. Each table is sold whole.</p>
          <div className="flex flex-wrap gap-2">
            {section.tables.map((t) => (
              <button key={t.id} type="button" disabled={t.taken} aria-pressed={tableIds.includes(t.id)} onClick={() => setTables((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))} className={chip(tableIds.includes(t.id), t.taken)}>
                {t.label}<span className="block text-xs opacity-70">{t.seats} seats</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-sm">Tickets</span>
          <button type="button" aria-label="Fewer" className={chip(false)} onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span className="w-6 text-center font-mono">{qty}</span>
          <button type="button" aria-label="More" className={chip(false)} onClick={() => setQty((q) => Math.min(Math.min(20, left), q + 1))}>+</button>
        </div>
      )}
      {tier && quantity > 0 ? <p className="text-sm">{quantity} × {price(tier.priceCents + tier.feeCents)} = <span className="font-medium">{price(quantity * (tier.priceCents + tier.feeCents))}</span> before tax</p> : null}
      {ageRestriction !== 'all' ? <p className="text-sm text-muted-foreground">Guests must be {ageRestriction}+ with valid ID.</p> : null}
      <button
        type="button" className={btn} disabled={pending || !tier || quantity < 1}
        onClick={() => start(async () => {
          setError('');
          const r = await createHold({ showId, tierId, quantity, tableIds: tableMode ? tableIds : undefined });
          if (!r.ok) { setError(r.error); return; }
          sessionStorage.setItem(`hold:${r.data.holdKey}`, JSON.stringify({ cartToken: r.data.cartToken, expiresAt: r.data.expiresAt, showId, ageRestriction }));
          router.push(`/checkout?hold=${encodeURIComponent(r.data.holdKey)}`);
        })}
      >{pending ? 'Holding' : 'Hold tickets'}</button>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
