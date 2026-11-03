'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandItem, CommandList, CommandInput, CommandEmpty } from '@/components/ui/command';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { ClientOnly } from '../../components/ClientOnly';

const ROLES = ['host', 'opener', 'guest_set', 'feature', 'headliner', 'bringer'];

function Pick({ label, value, options, onChange }: { label: string; value: string; options: { id: string; name: string }[]; onChange: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.id === value);
  const face = (
    <button type="button" aria-label={label} className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm">
      <span className="min-w-0 truncate">{current?.name || label}</span><ChevronsUpDown className="size-4 shrink-0 opacity-60" />
    </button>
  );
  return (
    <ClientOnly placeholder={face}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm">
          <span className="min-w-0 truncate">{current?.name || label}</span><ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,22rem)] p-0">
        <Command><CommandInput placeholder={`Find ${label.toLowerCase()}`} /><CommandList><CommandEmpty>None</CommandEmpty>
          {options.map((o) => <CommandItem key={o.id} value={o.name} onSelect={() => { onChange(o.id); setOpen(false); }}><Check className={`mr-2 size-4 ${o.id === value ? '' : 'opacity-0'}`} />{o.name}</CommandItem>)}
        </CommandList></Command>
      </PopoverContent>
    </Popover>
    </ClientOnly>
  );
}

export function OfferForm({ comedians, shows }: { comedians: { id: string; name: string; fee: number }[]; shows: { id: string; name: string }[] }) {
  const router = useRouter();
  const [showId, setShow] = React.useState(''); const [comedianId, setComedian] = React.useState(''); const [role, setRole] = React.useState('opener');
  const [msg, setMsg] = React.useState(''); const [pending, start] = React.useTransition();
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Pick label="Show" value={showId} options={shows} onChange={setShow} />
      <Pick label="Comedian" value={comedianId} options={comedians} onChange={setComedian} />
      <Pick label="Role" value={role} options={ROLES.map((r) => ({ id: r, name: r.replace('_', ' ') }))} onChange={setRole} />
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !showId || !comedianId} className={pillClass + ' border'} onClick={() => start(async () => {
          setMsg(''); const r = await runCommand('offerSlot', { showId, comedianId, role, position: 9, setMinutes: 10 });
          if (!r.ok) setMsg(r.error); else { setMsg('Offer sent'); router.refresh(); }
        })}>Offer slot</button>
        {msg ? <span role="status" className="text-xs">{msg}</span> : null}
      </div>
    </div>
  );
}
