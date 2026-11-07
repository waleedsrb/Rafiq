/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { noShowFrom, noShowOpen, pickupOpen, ratingOpen, startOpen, tripState } from './trip-day.ts';

const departs = new Date('2026-11-09T07:00:00Z');
const at = (iso: string) => new Date(iso);

test('trip state follows the timestamps', () => {
  const t = { cancelled_at: null, started_at: null, finished_at: null };
  assert.equal(tripState(t), 'scheduled');
  assert.equal(tripState({ ...t, started_at: 'x' }), 'underway');
  assert.equal(tripState({ ...t, started_at: 'x', finished_at: 'y' }), 'finished');
  assert.equal(tripState({ ...t, finished_at: 'y' }), 'finished'); // auto-finished, never started
  assert.equal(tripState({ ...t, cancelled_at: 'z' }), 'cancelled');
});

test('pickup opens an hour before, start and I am here 30 minutes before', () => {
  assert.equal(pickupOpen(at('2026-11-09T05:59:00Z'), departs), false);
  assert.equal(pickupOpen(at('2026-11-09T06:00:00Z'), departs), true);
  assert.equal(startOpen(at('2026-11-09T06:29:00Z'), departs), false);
  assert.equal(startOpen(at('2026-11-09T06:30:00Z'), departs), true);
});

test('no-show only from 10 minutes after departure', () => {
  assert.equal(noShowOpen(at('2026-11-09T07:09:00Z'), departs), false);
  assert.equal(noShowOpen(at('2026-11-09T07:10:00Z'), departs), true);
  assert.equal(noShowFrom(departs).toISOString(), '2026-11-09T07:10:00.000Z');
});

test('ratings close 7 days after the trip', () => {
  assert.equal(ratingOpen(at('2026-11-16T07:00:00Z'), departs), true);
  assert.equal(ratingOpen(at('2026-11-16T07:01:00Z'), departs), false);
});
