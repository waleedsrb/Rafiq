import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthSync } from './auth-sync.ts';

type S = { user: { id: string } };
const session = (id: string): S => ({ user: { id } });

// A profile load we can finish by hand, to act out "the database is slow".
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

test('a signed-in session is never published before its profile', async () => {
  const pending = deferred<{ name: string } | null>();
  const commits: Array<[S | null, { name: string } | null]> = [];
  const apply = createAuthSync<S, { name: string }>(() => pending.promise, (s, p) => commits.push([s, p]));

  const done = apply(session('waleed'));
  await Promise.resolve();
  // Profile still loading: nothing published, so the router never sees "signed in, no profile".
  assert.equal(commits.length, 0);

  pending.resolve({ name: 'Waleed' });
  assert.equal(await done, true);
  assert.deepEqual(commits, [[session('waleed'), { name: 'Waleed' }]]);
});

test('a new account with no profile row is published as signed in without a profile', async () => {
  const commits: unknown[] = [];
  const apply = createAuthSync<S, object>(async () => null, (s, p) => commits.push([s, p]));
  await apply(session('new'));
  assert.deepEqual(commits, [[session('new'), null]]);
});

test('sign out publishes right away with no profile', async () => {
  let loads = 0;
  const commits: unknown[] = [];
  const apply = createAuthSync<S, object>(async () => { loads++; return {}; }, (s, p) => commits.push([s, p]));
  await apply(null);
  assert.equal(loads, 0);
  assert.deepEqual(commits, [[null, null]]);
});

test('a slow, older answer is dropped when a newer change already landed', async () => {
  const slow = deferred<{ name: string } | null>();
  const commits: unknown[] = [];
  const apply = createAuthSync<S, { name: string }>(() => slow.promise, (s, p) => commits.push([s, p]));

  const first = apply(session('waleed'));
  const second = apply(null); // signed out before the profile came back
  assert.equal(await second, true);
  slow.resolve({ name: 'Waleed' });
  assert.equal(await first, false);
  assert.deepEqual(commits, [[null, null]]);
});

test('a failed profile load still settles instead of hanging', async () => {
  const commits: unknown[] = [];
  const apply = createAuthSync<S, object>(async () => { throw new Error('offline'); }, (s, p) => commits.push([s, p]));
  assert.equal(await apply(session('waleed')), true);
  assert.deepEqual(commits, [[session('waleed'), null]]);
});
