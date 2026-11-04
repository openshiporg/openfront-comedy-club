/** Offline door scanning: pure rules shared by the scanner UI and the check-in command. */

export const MAX_SCAN_AGE_MS = 12 * 3600000;

/** A scan made offline carries its real time. Never trust a future time or a stale one; fall back to the server clock. */
export function effectiveScanTime(scannedAt: unknown, now: Date): Date {
  const t = typeof scannedAt === 'string' ? new Date(scannedAt) : null;
  if (!t || Number.isNaN(t.getTime())) return now;
  if (t.getTime() > now.getTime() || now.getTime() - t.getTime() > MAX_SCAN_AGE_MS) return now;
  return t;
}

export const MAX_QUEUE = 200;
/** A device queue is dropped this long after the show ends. */
export const QUEUE_GRACE_MS = 6 * 3600000;

export type StoredQueue = { expiresAt: number; scans: QueuedScan[] };

/** When a show's saved scans stop being worth replaying: its end (or start + 6h) plus a grace. */
export function queueExpiry(show: { startsAt: string; endsAt?: string | null }): number {
  const end = show.endsAt ? new Date(show.endsAt).getTime() : NaN;
  const base = Number.isFinite(end) ? end : new Date(show.startsAt).getTime() + 6 * 3600000;
  return base + QUEUE_GRACE_MS;
}

/** Read a stored queue defensively. Expired, corrupt or old-format values come back empty. */
export function readStored(raw: string | null, now: number): QueuedScan[] {
  try {
    const v = JSON.parse(raw || 'null') as StoredQueue | null;
    if (!v || !Array.isArray(v.scans) || typeof v.expiresAt !== 'number' || v.expiresAt <= now) return [];
    return v.scans.filter((s) => s && typeof s.code === 'string' && typeof s.key === 'string' && typeof s.scannedAt === 'string').slice(0, MAX_QUEUE);
  } catch { return []; }
}

export type QueuedScan = { key: string; code: string; scannedAt: string };

export const normalizeCode = (v: string) => v.trim();

/** Add a scan unless the same code is already waiting on this device. */
export function enqueueScan(queue: QueuedScan[], scan: QueuedScan): { queue: QueuedScan[]; duplicate: boolean; full: boolean } {
  if (queue.some((s) => s.code.toLowerCase() === scan.code.toLowerCase())) return { queue, duplicate: true, full: false };
  if (queue.length >= MAX_QUEUE) return { queue, duplicate: false, full: true };
  return { queue: [...queue, scan], duplicate: false, full: false };
}

export type ScanAnswer = { result?: string; admittedAt?: string | null; admittedBy?: string | null; admittedMethod?: string | null; holderName?: string | null };

/** The sentence staff read for a server answer. A duplicate always says who admitted the ticket first and when. */
export function describeScan(code: string, a: ScanAnswer, fmt: (iso: string) => string = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })): { text: string; tone: 'ok' | 'warn' } {
  const who = a.holderName ? `${code} (${a.holderName})` : code;
  switch (a.result) {
    case 'admitted': return { text: `${who}: admitted`, tone: 'ok' };
    case 'duplicate': {
      const at = a.admittedAt ? ` at ${fmt(a.admittedAt)}` : '';
      const by = a.admittedBy ? ` by ${a.admittedBy}${a.admittedMethod ? ` (${a.admittedMethod})` : ''}` : '';
      return { text: `${who}: already admitted${at}${by}`, tone: 'warn' };
    }
    case 'wrong_show': return { text: `${who}: ticket is for a different show`, tone: 'warn' };
    case 'void': return { text: `${who}: ticket is void, do not admit`, tone: 'warn' };
    default: return { text: `${who}: ${String(a.result || 'done').replace(/_/g, ' ')}`, tone: 'warn' };
  }
}

export type DrainOutcome = { scan: QueuedScan; kind: 'done' | 'rejected' | 'offline'; detail?: string; answer?: ScanAnswer };

/**
 * Replay oldest first. `send` resolves with the server's answer, or throws when the network is down.
 * A network failure stops the drain and keeps everything left; a server answer (admitted, duplicate, not found) removes the scan.
 */
export async function drainQueue(queue: QueuedScan[], send: (s: QueuedScan) => Promise<{ ok: boolean; result?: string; error?: string; answer?: ScanAnswer }>) {
  const outcomes: DrainOutcome[] = []; let rest = [...queue];
  while (rest.length) {
    const scan = rest[0];
    try {
      const r = await send(scan);
      outcomes.push(r.ok ? { scan, kind: 'done', detail: r.result, answer: r.answer } : { scan, kind: 'rejected', detail: r.error });
      rest = rest.slice(1);
    } catch {
      outcomes.push({ scan, kind: 'offline' });
      break;
    }
  }
  return { outcomes, rest };
}
