import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOLD_MS, HUM_FAST_MS, HUM_SLOW_MS, confidence, humGap, humPattern, minutesAgo } from './checkpoints.ts';

test('minutes ago rounds down and never goes negative', () => {
  const now = new Date('2026-11-07T08:30:00Z');
  assert.equal(minutesAgo(new Date('2026-11-07T08:21:30Z'), now), 8);
  assert.equal(minutesAgo(new Date('2026-11-07T08:30:00Z'), now), 0);
  assert.equal(minutesAgo(new Date('2026-11-07T08:31:00Z'), now), 0); // phone clock a bit behind
});

test('the hum speeds up smoothly from slow to fast, never backwards', () => {
  assert.equal(humGap(0), HUM_SLOW_MS);
  assert.equal(humGap(HOLD_MS), HUM_FAST_MS);
  for (let t = 10; t <= HOLD_MS; t += 10) assert.ok(humGap(t) <= humGap(t - 10));
});

test('the Android pattern lasts the hold and ends as one continuous buzz', () => {
  const p = humPattern();
  const total = p.reduce((a, b) => a + b, 0);
  assert.ok(total >= HOLD_MS && total < HOLD_MS + 60);
  assert.equal(p[p.length - 1], 0); // last wait: none
});

test('confidence: nothing without a status, otherwise confirmed or not yet', () => {
  assert.equal(confidence({ status: null, confirmed: false }), null);
  assert.equal(confidence({ status: 'open', confirmed: true }), 'confirmed');
  assert.equal(confidence({ status: 'closed', confirmed: false }), 'unconfirmed');
  assert.equal(confidence({ status: 'crowded' }), 'unconfirmed'); // an older app version's row
});
