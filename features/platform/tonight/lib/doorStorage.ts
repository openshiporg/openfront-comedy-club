/** Saved door scans hold ticket codes, so they are removed on sign-out and after the show. */
export const DOOR_QUEUE_PREFIX = 'door-queue:';

export function clearDoorQueues(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> = globalThis.localStorage) {
  if (!storage) return 0;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(DOOR_QUEUE_PREFIX)) keys.push(k); }
  keys.forEach((k) => storage.removeItem(k));
  return keys.length;
}

/** Remove saved queues for any show whose window has passed, or that cannot be read. Returns how many were dropped. */
export function sweepExpiredDoorQueues(now: number, storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'> = globalThis.localStorage) {
  if (!storage) return 0;
  const drop: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k || !k.startsWith(DOOR_QUEUE_PREFIX)) continue;
    try { const v = JSON.parse(storage.getItem(k) || 'null'); if (!v || typeof v.expiresAt !== 'number' || v.expiresAt <= now || !Array.isArray(v.scans) || !v.scans.length) drop.push(k); } catch { drop.push(k); }
  }
  drop.forEach((k) => storage.removeItem(k));
  return drop.length;
}
