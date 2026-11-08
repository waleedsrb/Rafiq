import assert from 'node:assert/strict';
import test from 'node:test';

import { LAUNCH_SEEN_KEY, launchDestination, markLaunchSeen, readLaunchMode } from './launch-state.ts';

test('first use is full until the animation completes, then later launches are short', async () => {
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
  assert.equal(await readLaunchMode(storage), 'full');
  assert.equal(values.has(LAUNCH_SEEN_KEY), false);
  await markLaunchSeen(storage);
  assert.equal(await readLaunchMode(storage), 'short');
  await markLaunchSeen(storage);
  assert.equal(values.get(LAUNCH_SEEN_KEY), '1');
});

test('storage failures allow a short launch and never block completion', async () => {
  const storage = { getItem: async () => { throw new Error('unavailable'); }, setItem: async () => { throw new Error('unavailable'); } };
  assert.equal(await readLaunchMode(storage), 'short');
  await assert.doesNotReject(markLaunchSeen(storage));
});

test('landing destination follows the session, independently of launch history', () => {
  assert.equal(launchDestination(false, false), '/intro');
  assert.equal(launchDestination(false, true), '/intro');
  assert.equal(launchDestination(true, false), '/sign-up/profile');
  assert.equal(launchDestination(true, true), '/home');
});
