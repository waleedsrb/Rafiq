/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byWeek, monthRange, noticeGiven, totals, type EarningRow } from './earnings.ts';

const row = (id: string, at: Date, earned: number | string): EarningRow => ({
  trip_id: id,
  origin: 'osm-n246843686',
  destination: 'osm-n293546203',
  departs_at: at.toISOString(),
  riders: 1,
  no_shows: 0,
  earned_ils: earned,
});

test('monthRange covers the whole calendar month', () => {
  const { from, to } = monthRange(new Date(2026, 10, 7, 15));
  assert.deepEqual([from.getMonth(), from.getDate(), to.getMonth(), to.getDate()], [10, 1, 11, 1]);
  const dec = monthRange(new Date(2026, 11, 31));
  assert.equal(dec.to.getFullYear(), 2027);
});

test('totals adds numeric strings from Postgres', () => {
  assert.deepEqual(totals([row('a', new Date(), '75'), row('b', new Date(), 25)]), { amount: 100, trips: 2 });
  assert.deepEqual(totals([]), { amount: 0, trips: 0 });
});

test('byWeek groups Sunday to Saturday, newest week first', () => {
  // Sun 1 Nov 2026, Thu 5 Nov, Sun 8 Nov
  const weeks = byWeek([
    row('a', new Date(2026, 10, 1, 7), 50),
    row('b', new Date(2026, 10, 5, 7), 25),
    row('c', new Date(2026, 10, 8, 7), 75),
  ]);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].rows[0].trip_id, 'c');
  assert.equal(weeks[1].amount, 75);
  assert.deepEqual(
    weeks[1].rows.map((r) => r.trip_id),
    ['b', 'a'],
  );
});

test('noticeGiven says hours, or minutes under an hour', () => {
  const dep = new Date(2026, 10, 7, 7, 0);
  assert.deepEqual(noticeGiven(new Date(2026, 10, 7, 4, 10), dep), {
    hours: 3,
  });
  assert.deepEqual(noticeGiven(new Date(2026, 10, 7, 6, 20), dep), {
    minutes: 40,
  });
  assert.deepEqual(noticeGiven(new Date(2026, 10, 7, 8, 0), dep), {
    minutes: 0,
  });
});
