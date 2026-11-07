import assert from 'node:assert/strict';
import { test } from 'node:test';

import { minutesAgo } from './checkpoints.ts';

test('minutes ago rounds down and never goes negative', () => {
  const now = new Date('2026-11-07T08:30:00Z');
  assert.equal(minutesAgo(new Date('2026-11-07T08:21:30Z'), now), 8);
  assert.equal(minutesAgo(new Date('2026-11-07T08:30:00Z'), now), 0);
  assert.equal(minutesAgo(new Date('2026-11-07T08:31:00Z'), now), 0); // phone clock a bit behind
});
