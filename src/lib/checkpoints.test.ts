import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOLD_MS, HOLD_TICKS, confidence, minutesAgo, rowSide } from './checkpoints.ts';

test('minutes ago rounds down and never goes negative', () => {
  const now = new Date('2026-11-07T08:30:00Z');
  assert.equal(minutesAgo(new Date('2026-11-07T08:21:30Z'), now), 8);
  assert.equal(minutesAgo(new Date('2026-11-07T08:30:00Z'), now), 0);
  assert.equal(minutesAgo(new Date('2026-11-07T08:31:00Z'), now), 0); // phone clock a bit behind
});

test('hold ticks build up: closer together, never weaker, all before the fill completes', () => {
  assert.equal(HOLD_TICKS[0].at, 0);
  for (let i = 1; i < HOLD_TICKS.length; i++) {
    assert.ok(HOLD_TICKS[i].at > HOLD_TICKS[i - 1].at);
    assert.ok(HOLD_TICKS[i].level >= HOLD_TICKS[i - 1].level);
    if (i >= 2) {
      const gap = HOLD_TICKS[i].at - HOLD_TICKS[i - 1].at;
      const before = HOLD_TICKS[i - 1].at - HOLD_TICKS[i - 2].at;
      assert.ok(gap <= before, `gap ${i} should not grow`);
    }
  }
  assert.ok(HOLD_TICKS[HOLD_TICKS.length - 1].at < HOLD_MS);
});

test('confidence: nothing without a status, otherwise confirmed or not yet', () => {
  assert.equal(confidence({ status: null, confirmed: false }), null);
  assert.equal(confidence({ status: 'open', confirmed: true }), 'confirmed');
  assert.equal(confidence({ status: 'closed', confirmed: false }), 'unconfirmed');
  assert.equal(confidence({ status: 'crowded' }), 'unconfirmed'); // an older app version's row
});

test('hold ticks are fast: many of them, never more than 80 ms apart', () => {
  assert.ok(HOLD_TICKS.length >= 15);
  for (let i = 1; i < HOLD_TICKS.length; i++) assert.ok(HOLD_TICKS[i].at - HOLD_TICKS[i - 1].at <= 80);
  assert.equal(HOLD_TICKS[HOLD_TICKS.length - 1].level, 3);
});

test('row side: outer buttons lean in, the middle one stays centred', () => {
  assert.deepEqual([0, 1, 2].map((i) => rowSide(i, 3)), ['start', 'middle', 'end']);
  assert.deepEqual([0, 1].map((i) => rowSide(i, 2)), ['start', 'end']);
  assert.equal(rowSide(0, 1), 'middle');
});
