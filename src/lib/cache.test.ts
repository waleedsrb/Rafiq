import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCache } from './cache.ts';

function counter<T>(value: T) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    fetch: async () => {
      calls++;
      return value;
    },
  };
}

test('first load fills the cache and tells listeners', async () => {
  const c = createCache();
  const src = counter({ plate: '7-1234-95' });
  let told = 0;
  c.subscribe('car', () => told++);
  assert.equal(c.has('car'), false);
  await c.load({ key: 'car', fetch: src.fetch });
  assert.deepEqual(c.get('car'), { plate: '7-1234-95' });
  assert.equal(told, 1);
});

test('two pages asking at once share one request', async () => {
  const c = createCache();
  const src = counter(1);
  await Promise.all([c.load({ key: 'k', fetch: src.fetch }), c.load({ key: 'k', fetch: src.fetch })]);
  assert.equal(src.calls, 1);
});

test('a fresh answer is reused; an older one is asked for again', async () => {
  let t = 0;
  const c = createCache(() => t);
  const src = counter('x');
  await c.load({ key: 'k', fetch: src.fetch }, 5000);
  t = 1000;
  await c.load({ key: 'k', fetch: src.fetch }, 5000);
  assert.equal(src.calls, 1);
  t = 6000;
  await c.load({ key: 'k', fetch: src.fetch }, 5000);
  assert.equal(src.calls, 2);
});

test('a failure keeps the old answer', async () => {
  const c = createCache();
  await c.load({ key: 'k', fetch: async () => 'good' });
  const back = await c.load({ key: 'k', fetch: async () => Promise.reject(new Error('offline')) });
  assert.equal(back, 'good');
  assert.equal(c.get('k'), 'good');
  assert.equal(c.failed('k'), true);
});

test('set updates by hand (after a save) and clear forgets everything', () => {
  const c = createCache();
  c.set('prefs', { notify: true });
  c.set<{ notify: boolean }>('prefs', (old) => ({ ...old!, notify: false }));
  assert.deepEqual(c.get('prefs'), { notify: false });
  let told = 0;
  c.subscribe('prefs', () => told++);
  c.clear();
  assert.equal(c.has('prefs'), false);
  assert.equal(told, 1);
});

test('refetch asks again even mid-request, and the newer answer wins', async () => {
  const c = createCache();
  let release: (v: string) => void = () => {};
  const slow = new Promise<string>((r) => (release = r));
  const first = c.load({ key: 'k', fetch: () => slow });
  const second = await c.refetch({ key: 'k', fetch: async () => 'new' });
  assert.equal(second, 'new');
  release('old');
  await first;
  assert.equal(c.get('k'), 'new');
});

test('a value set by hand (a save) is not undone by an older request landing after it', async () => {
  const c = createCache();
  let release: (v: string) => void = () => {};
  const p = c.load({ key: 'k', fetch: () => new Promise<string>((r) => (release = r)) });
  c.set('k', 'saved');
  release('before the save');
  await p;
  assert.equal(c.get('k'), 'saved');
  // and the next load starts a fresh request instead of waiting on the old one
  assert.equal(await c.load({ key: 'k', fetch: async () => 'next' }), 'next');
});
