/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byDay, countByDay, dayIndex, filterTrips, leavingSoon, searchDayStart } from './trip-search.ts';

const at = (h: number, women = false) => ({ departs_at: new Date(2026, 10, 9, h, 0).toISOString(), women_only: women });

test('a day chip means local midnight that many days ahead', () => {
  assert.deepEqual(searchDayStart(0, new Date(2026, 10, 8, 23, 30)), new Date(2026, 10, 8));
  assert.deepEqual(searchDayStart(1, new Date(2026, 10, 8, 23, 30)), new Date(2026, 10, 9));
  // Crosses the month end.
  assert.deepEqual(searchDayStart(3, new Date(2026, 10, 29, 8)), new Date(2026, 11, 2));
});

test('women only off keeps every trip, in order', () => {
  const trips = [at(6), at(13, true), at(19)];
  assert.deepEqual(filterTrips(trips, false), trips);
});

test('women only keeps only women-only trips', () => {
  const trips = [at(7, true), at(8), at(18, true)];
  assert.deepEqual(filterTrips(trips, true), [at(7, true), at(18, true)]);
});

test('no day picked: every trip, a day at a time, keeping the server order within a day', () => {
  const now = new Date(2026, 10, 8, 9, 0);
  const t = (id: string, d: number, h: number) => ({ id, departs_at: new Date(2026, 10, d, h).toISOString() });
  // The server puts exact towns first, then nearby ones; across days that order restarts.
  const server = [t('a', 9, 7), t('b', 8, 18), t('c', 9, 6), t('d', 7, 6), t('e', 8, 10)];
  assert.deepEqual(
    byDay(server, now).map((r) => r.id),
    ['b', 'e', 'a', 'c'],
  );
});

test('a departure lands on the chip of its local day', () => {
  const now = new Date(2026, 10, 8, 21, 0);
  assert.equal(dayIndex(new Date(2026, 10, 8, 23, 59).toISOString(), now), 0);
  assert.equal(dayIndex(new Date(2026, 10, 9, 0, 1).toISOString(), now), 1);
  assert.equal(dayIndex(new Date(2026, 10, 14, 7).toISOString(), now), 6);
  assert.equal(dayIndex(new Date(2026, 10, 15, 7).toISOString(), now), 7);
  assert.equal(dayIndex(new Date(2026, 11, 8, 7).toISOString(), now), 30);
  assert.equal(dayIndex(new Date(2026, 11, 9, 7).toISOString(), now), -1);
  assert.equal(dayIndex(new Date(2026, 10, 7, 7).toISOString(), now), -1);
});

test('the week is counted per day chip', () => {
  const now = new Date(2026, 10, 8, 9, 0);
  const t = (d: number, h: number) => ({ departs_at: new Date(2026, 10, d, h).toISOString() });
  assert.deepEqual(countByDay([t(8, 10), t(9, 7), t(9, 18), t(13, 6)], now).slice(0, 7), [1, 2, 0, 0, 0, 1, 0]);
});

test('leaving soon means within the next hour', () => {
  const now = new Date(2026, 10, 8, 9, 0);
  assert.equal(leavingSoon(new Date(2026, 10, 8, 9, 40).toISOString(), now), true);
  assert.equal(leavingSoon(new Date(2026, 10, 8, 10, 30).toISOString(), now), false);
  assert.equal(leavingSoon(new Date(2026, 10, 8, 8, 50).toISOString(), now), false);
});
