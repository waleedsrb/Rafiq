/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { freeCancel, respondBy } from './rules.ts';

const at = (iso: string) => new Date(iso);
const now = at('2026-11-07T08:00:00Z');

test('response window depends on how far away the trip is', () => {
  // 2 days away: 6 hours
  assert.equal(respondBy(now, at('2026-11-09T08:00:00Z')).toISOString(), '2026-11-07T14:00:00.000Z');
  // 10 hours away: 2 hours
  assert.equal(respondBy(now, at('2026-11-07T18:00:00Z')).toISOString(), '2026-11-07T10:00:00.000Z');
  // 3 hours away: 30 minutes
  assert.equal(respondBy(now, at('2026-11-07T11:00:00Z')).toISOString(), '2026-11-07T08:30:00.000Z');
  // 10 minutes away: capped at departure
  assert.equal(respondBy(now, at('2026-11-07T08:10:00Z')).toISOString(), '2026-11-07T08:10:00.000Z');
});

test('cancelling is free until 12 hours before', () => {
  const departs = at('2026-11-08T08:00:00Z');
  assert.equal(freeCancel(at('2026-11-07T20:00:00Z'), departs, now), true); // exactly 12h
  assert.equal(freeCancel(at('2026-11-07T20:01:00Z'), departs, now), false);
});

test('late bookings get 15 free minutes after acceptance', () => {
  const departs = at('2026-11-07T12:00:00Z');
  const accepted = at('2026-11-07T09:00:00Z');
  assert.equal(freeCancel(at('2026-11-07T09:15:00Z'), departs, accepted), true);
  assert.equal(freeCancel(at('2026-11-07T09:16:00Z'), departs, accepted), false);
});
