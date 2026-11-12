'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ClientOnly } from '../../components/ClientOnly';
import { Command, CommandItem, CommandList, CommandEmpty, CommandInput } from '@/components/ui/command';

export function ShowSwitcher({ shows, currentId }: { shows: { id: string; title: string; when: string }[]; currentId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const current = shows.find((s) => s.id === currentId);
  const face = (
    <button type="button" className="inline-flex h-11 w-full max-w-md items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm">
      <span className="min-w-0 truncate">{current ? `${current.title} · ${current.when}` : 'Choose a show'}</span>
      <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
    </button>
  );
  return (
    <ClientOnly placeholder={face}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-11 w-full max-w-md items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm">
          <span className="min-w-0 truncate">{current ? `${current.title} · ${current.when}` : 'Choose a show'}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,26rem)] p-0">
        <Command>
          <CommandInput placeholder="Find a show" />
          <CommandList>
            <CommandEmpty>No shows</CommandEmpty>
            {shows.map((s) => (
              <CommandItem key={s.id} value={`${s.title} ${s.when}`} onSelect={() => { setOpen(false); router.push(`/dashboard/platform/tonight?show=${s.id}`); }}>
                <Check className={`mr-2 size-4 ${s.id === currentId ? 'opacity-100' : 'opacity-0'}`} />
                <span className="min-w-0 truncate">{s.title} · {s.when}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    </ClientOnly>
  );
}
