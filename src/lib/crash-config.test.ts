import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_DSN, crashOptions, crashUser } from './crash-config.ts';

test('reports are off while developing on a laptop', () => {
  const o = crashOptions({ isDev: true });
  assert.equal(o.enabled, false);
  assert.equal(o.environment, 'development');
  assert.equal(o.release, 'rafiq@dev');
});

test('published builds report, tagged with channel, short sha and update id', () => {
  const o = crashOptions({ isDev: false, build: '9065013abcdef', channel: 'preview', updateId: 'u-1' });
  assert.equal(o.enabled, true);
  assert.equal(o.environment, 'preview');
  assert.equal(o.release, 'rafiq@9065013');
  assert.equal(o.dist, 'u-1');
  assert.equal(o.dsn, APP_DSN);
});

test('a store build with no channel counts as production', () => {
  assert.equal(crashOptions({ isDev: false, channel: null }).environment, 'production');
  assert.equal(crashOptions({ isDev: false }).dist, 'embedded');
});

test('no personal details are sent by default', () => {
  const o = crashOptions({ isDev: false });
  assert.equal(o.sendDefaultPii, false);
  assert.equal(o.tracesSampleRate, 0);
});

test('only the user id is attached to a report', () => {
  assert.deepEqual(crashUser('abc'), { id: 'abc' });
  assert.equal(crashUser(null), null);
  assert.equal(crashUser(undefined), null);
});
