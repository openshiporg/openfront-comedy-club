'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { Status } from '../../components/ui';

export function DoorScanner({ showId }: { showId: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState('');
  const [result, setResult] = React.useState<{ result?: string; error?: string } | null>(null);
  const [pending, start] = React.useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = value.trim();
    if (!code) return;
    start(async () => {
      const r = await runCommand('checkInTicket', { tokenOrCode: code, showId, method: 'scan' });
      setResult(r.ok ? { result: r.data?.result } : { error: r.error });
      setValue('');
      router.refresh();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ticket code or scan"
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          autoCapitalize="characters" autoComplete="off" spellCheck={false}
        />
        <button type="submit" disabled={pending} className={pillClass + ' h-10 border'}>Check in</button>
      </div>
      {result ? (
        <div role="status" className="text-sm">
          {result.error ? <span className="text-red-600">{result.error}</span> : <Status value={result.result} />}
        </div>
      ) : null}
    </form>
  );
}
