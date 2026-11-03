'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { ActionButton, pillClass } from '../../components/ActionButton';
import { Status } from '../../components/ui';
import { money } from '../../lib/format';
import { ClientOnly } from '../../components/ClientOnly';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandItem, CommandList, CommandInput, CommandEmpty } from '@/components/ui/command';

type Item = { id: string; name: string; qty: number; priceCents: number; voided: boolean; countsTowardMinimum: boolean };
export function CheckPanel({ check, menu }: { check: { id: string; status: string; guestCount: number; minimumItemsRequired: number; minimumItemsMet: boolean; items: Item[]; seat: string }; menu: { id: string; name: string; priceCents: number }[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState('');
  const [tip, setTip] = React.useState('');
  const [pending, start] = React.useTransition();
  const live = check.items.filter((i) => !i.voided);
  const have = live.filter((i) => i.countsTowardMinimum).reduce((n, i) => n + i.qty, 0);
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{check.seat}</span>
        <Status value={check.status} />
      </div>
      <p className="text-xs text-muted-foreground">{have} of {check.minimumItemsRequired} minimum items · {check.guestCount} guests</p>
      <div>{live.map((i) => <div key={i.id} className="flex justify-between gap-3 py-1 text-sm"><span className="min-w-0 break-words">{i.qty} × {i.name}</span><span className="font-mono text-xs">{money(i.qty * i.priceCents)}</span></div>)}</div>
      {['open', 'presented'].includes(check.status) ? (
        <div className="flex flex-wrap items-center gap-2">
          <ClientOnly placeholder={<button type="button" className={pillClass + ' border'}>Add item</button>}>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild><button type="button" className={pillClass + ' border'}>Add item</button></PopoverTrigger>
            <PopoverContent className="w-[min(92vw,22rem)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Find an item" />
                <CommandList>
                  <CommandEmpty>No items</CommandEmpty>
                  {menu.map((m) => (
                    <CommandItem key={m.id} value={m.name} onSelect={() => { setOpen(false); start(async () => { const r = await runCommand('addCheckItem', { checkId: check.id, menuItemId: m.id, qty: 1 }); if (!r.ok) setError(r.error); else router.refresh(); }); }}>
                      <span className="flex-1">{m.name}</span><span className="font-mono text-xs">{money(m.priceCents)}</span>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          </ClientOnly>
          <input value={tip} onChange={(e) => setTip(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="Tip" aria-label="Tip in dollars" className="h-8 w-20 rounded-md border bg-background px-2 text-sm" />
          <button type="button" disabled={pending} className={pillClass + ' border'} onClick={() => start(async () => { setError(''); const r = await runCommand('closeCheck', { checkId: check.id, tipCents: Math.round(Number(tip || 0) * 100) }); if (!r.ok) setError(r.error); else router.refresh(); })}>Close check</button>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
