/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clock, dayPart, formatCountdown } from './format.ts';

const local = (h: number, m: number) => new Date(2026, 10, 7, h, m);

test('12-hour clock for big times', () => {
  assert.deepEqual(clock(local(7, 30)), { time: '7:30', pm: false });
  assert.deepEqual(clock(local(0, 5)), { time: '12:05', pm: false });
  assert.deepEqual(clock(local(12, 0)), { time: '12:00', pm: true });
  assert.deepEqual(clock(local(13, 5)), { time: '1:05', pm: true });
});

test('part of the day', () => {
  assert.equal(dayPart(local(11, 59)), 'morning');
  assert.equal(dayPart(local(12, 0)), 'afternoon');
  assert.equal(dayPart(local(17, 0)), 'evening');
});

test('countdown text', () => {
  assert.equal(formatCountdown((1 * 3600 + 42 * 60 + 10) * 1000), '1:42:10');
  assert.equal(formatCountdown((12 * 60 + 5) * 1000), '12:05');
  assert.equal(formatCountdown(-5), '0:00');
});

test('list times are 24-hour without a leading zero', async () => {
  const { shortTime } = await import('./format.ts');
  assert.equal(shortTime(local(7, 30)), '7:30');
  assert.equal(shortTime(local(18, 0)), '18:00');
});
