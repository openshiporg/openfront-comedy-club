/** Offline door scanning: pure rules shared by the scanner UI and the check-in command. */

export const MAX_SCAN_AGE_MS = 12 * 3600000;

/** A scan made offline carries its real time. Never trust a future time or a stale one; fall back to the server clock. */
export function effectiveScanTime(scannedAt: unknown, now: Date): Date {
  const t = typeof scannedAt === 'string' ? new Date(scannedAt) : null;
  if (!t || Number.isNaN(t.getTime())) return now;
  if (t.getTime() > now.getTime() || now.getTime() - t.getTime() > MAX_SCAN_AGE_MS) return now;
  return t;
}

export type QueuedScan = { key: string; code: string; scannedAt: string };

export const normalizeCode = (v: string) => v.trim();

/** Add a scan unless the same code is already waiting on this device. */
export function enqueueScan(queue: QueuedScan[], scan: QueuedScan): { queue: QueuedScan[]; duplicate: boolean } {
  if (queue.some((s) => s.code.toLowerCase() === scan.code.toLowerCase())) return { queue, duplicate: true };
  return { queue: [...queue, scan], duplicate: false };
}

export type DrainOutcome = { scan: QueuedScan; kind: 'done' | 'rejected' | 'offline'; detail?: string };

/**
 * Replay oldest first. `send` resolves with the server's answer, or throws when the network is down.
 * A network failure stops the drain and keeps everything left; a server answer (admitted, duplicate, not found) removes the scan.
 */
export async function drainQueue(queue: QueuedScan[], send: (s: QueuedScan) => Promise<{ ok: boolean; result?: string; error?: string }>) {
  const outcomes: DrainOutcome[] = []; let rest = [...queue];
  while (rest.length) {
    const scan = rest[0];
    try {
      const r = await send(scan);
      outcomes.push(r.ok ? { scan, kind: 'done', detail: r.result } : { scan, kind: 'rejected', detail: r.error });
      rest = rest.slice(1);
    } catch {
      outcomes.push({ scan, kind: 'offline' });
      break;
    }
  }
  return { outcomes, rest };
}
