import { test } from 'node:test'; import assert from 'node:assert/strict';
import { clearDoorQueues, sweepExpiredDoorQueues, DOOR_QUEUE_PREFIX } from './doorStorage';
function fake(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, getItem: (k: string) => m.get(k) ?? null, key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => { m.delete(k); }, keys: () => [...m.keys()] };
}
test('sign-out removes every show queue and nothing else', () => {
  const st = fake({ [DOOR_QUEUE_PREFIX + 'a']: '{}', [DOOR_QUEUE_PREFIX + 'b']: '{}', theme: 'dark', other: '1' });
  assert.equal(clearDoorQueues(st), 2); assert.deepEqual(st.keys().sort(), ['other', 'theme']);
});
test('no storage means nothing to clear', () => assert.equal(clearDoorQueues(undefined as any), 0));
test('sweep drops queues of other shows once their window passed, keeps live ones and unrelated keys', () => {
  const now = 1_000_000; const live = JSON.stringify({ expiresAt: now + 5, scans: [{ key: 'k', code: 'C', scannedAt: 'x' }] });
  const st = fake({ [DOOR_QUEUE_PREFIX + 'live']: live, [DOOR_QUEUE_PREFIX + 'old']: JSON.stringify({ expiresAt: now - 1, scans: [{}] }), [DOOR_QUEUE_PREFIX + 'junk']: '{nope', [DOOR_QUEUE_PREFIX + 'empty']: JSON.stringify({ expiresAt: now + 5, scans: [] }), theme: 'dark' });
  assert.equal(sweepExpiredDoorQueues(now, st), 3); assert.deepEqual(st.keys().sort(), [DOOR_QUEUE_PREFIX + 'live', 'theme']);
});
