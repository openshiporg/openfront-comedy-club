'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../actions/commands';

export function PillTrack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1', className)}>{children}</div>;
}

export const pillClass = 'inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md bg-background px-3 text-sm font-medium shadow-sm transition disabled:opacity-50';

/** Runs one named custom operation. The server action supplies the idempotency key. */
export function ActionButton({ op, vars, children, paths, confirm, onDone, className }: {
  op: string; vars: Record<string, unknown>; children: React.ReactNode; paths?: string[]; confirm?: string;
  onDone?: (data: unknown) => void; className?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={cn(pillClass, className)}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError('');
          start(async () => {
            const r = await runCommand(op, vars, paths);
            if (!r.ok) setError(r.error); else { onDone?.(r.data); router.refresh(); }
          });
        }}
      >
        {pending ? 'Working' : children}
      </button>
      {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
