'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { runCommand } from '../../actions/commands';
import { Status } from '../../components/ui';
import { drainQueue, enqueueScan, normalizeCode, type QueuedScan } from '@/features/keystone/lib/doorQueue';

/** Server answers that mean "this scan is dealt with". Anything else (session expired, server error) pauses the queue and keeps the scans. */
const FINAL_ERRORS = [/ticket not found/i];

type Feedback = { result?: string; error?: string; queued?: boolean; code?: string } | null;

export function DoorScanner({ showId }: { showId: string }) {
  const router = useRouter();
  const storeKey = `door-queue:${showId}`;
  const [value, setValue] = React.useState('');
  const [queue, setQueue] = React.useState<QueuedScan[]>([]);
  const [feedback, setFeedback] = React.useState<Feedback>(null);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [paused, setPaused] = React.useState<string | null>(null);
  const [online, setOnline] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const busy = React.useRef(false);
  const queueRef = React.useRef<QueuedScan[]>([]);

  const save = (q: QueuedScan[]) => { queueRef.current = q; setQueue(q); try { q.length ? localStorage.setItem(storeKey, JSON.stringify(q)) : localStorage.removeItem(storeKey); } catch { /* storage full or blocked: the queue still works in memory */ } };
  const send = async (s: QueuedScan) => {
    // the stored key makes a retry of the same scan replay instead of scanning twice
    const r = await runCommand('checkInTicket', { tokenOrCode: s.code, showId, method: 'scan', scannedAt: s.scannedAt, idempotencyKey: s.key });
    if (r.ok) return { ok: true, result: r.data?.result as string | undefined };
    if (FINAL_ERRORS.some((re) => re.test(r.error || ''))) return { ok: false, error: r.error };
    throw new Error(r.error || 'Check-in unavailable');
  };
  const drain = React.useCallback(async () => {
    if (busy.current || !queueRef.current.length) return;
    busy.current = true; setPaused(null);
    let lastError: string | null = null;
    const { outcomes, rest } = await drainQueue(queueRef.current, async (s) => { try { return await send(s); } catch (e: any) { lastError = e?.message || null; throw e; } });
    save(rest);
    const done = outcomes.filter((o) => o.kind !== 'offline').map((o) => `${o.scan.code}: ${o.kind === 'done' ? (o.detail || 'done').replace(/_/g, ' ') : o.detail || 'rejected'}`);
    if (done.length) setNotes((n) => [...done, ...n].slice(0, 8));
    if (rest.length) setPaused(lastError && !/fetch|network|failed to/i.test(lastError) ? lastError : 'Offline. Scans are saved on this device.');
    busy.current = false; router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    try { const stored = JSON.parse(localStorage.getItem(storeKey) || '[]'); if (Array.isArray(stored) && stored.length) { queueRef.current = stored; setQueue(stored); if (navigator.onLine) void drain(); } } catch { /* ignore a corrupt queue */ }
    const up = () => { setOnline(true); void drain(); }; const down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [storeKey, drain]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(value);
    if (!code) return;
    setValue('');
    const scan: QueuedScan = { key: crypto.randomUUID(), code, scannedAt: new Date().toISOString() };
    void (async () => {
      setPending(true);
      try {
      if (queueRef.current.length || !navigator.onLine) {
        const r = enqueueScan(queueRef.current, scan);
        if (r.duplicate) { setFeedback({ error: `${code} is already waiting on this device`, code }); return; }
        save(r.queue); setFeedback({ queued: true, code }); if (navigator.onLine) void drain(); return;
      }
      try {
        const r = await send(scan);
        setFeedback(r.ok ? { result: r.result, code } : { error: r.error, code });
        router.refresh();
      } catch {
        save(enqueueScan(queueRef.current, scan).queue); setFeedback({ queued: true, code });
      }
      } finally { setPending(false); }
    })();
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ticket code or scan"
          className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          autoCapitalize="characters" autoComplete="off" spellCheck={false}
        />
        <Button type="submit" variant="outline" disabled={pending} className="h-10">Check in</Button>
      </div>
      {!online || queue.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs uppercase tracking-wide" data-testid="door-queue">
          <span>{!online ? 'Offline' : 'Online'} · {queue.length} saved scan{queue.length === 1 ? '' : 's'} waiting</span>
          {queue.length && online ? <Button type="button" variant="outline" size="sm" onClick={() => void drain()}>Send now</Button> : null}
        </div>
      ) : null}
      {paused ? <p role="status" className="text-xs text-muted-foreground">{paused}</p> : null}
      {feedback ? (
        <div role="status" className="text-sm">
          {feedback.queued ? <span>Saved offline: {feedback.code}. It will be checked in when you are back online.</span> : feedback.error ? <span className="text-red-600">{feedback.error}</span> : <Status value={feedback.result} />}
        </div>
      ) : null}
      {notes.length ? <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Synced scans">{notes.map((n, i) => <li key={i} className="break-all font-mono">{n}</li>)}</ul> : null}
    </form>
  );
}
