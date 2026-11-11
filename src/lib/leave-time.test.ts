import { test } from 'node:test';
import assert from 'node:assert/strict';

import { earliestToday, monthCells, slotBars, snapMinutes, untilWords } from './leave-time.ts';

test('today starts on the next half hour at least 30 minutes away', () => {
  assert.equal(earliestToday(new Date(2026, 10, 11, 13, 55)), 14 * 60 + 30);
  assert.equal(earliestToday(new Date(2026, 10, 11, 7, 0)), 7 * 60 + 30);
  assert.equal(earliestToday(new Date(2026, 10, 11, 7, 1)), 8 * 60);
  assert.equal(earliestToday(new Date(2026, 10, 11, 23, 20)), null);
});

test('times snap to 5 minutes and stay inside the day', () => {
  assert.equal(snapMinutes(452), 450);
  assert.equal(snapMinutes(453), 455);
  assert.equal(snapMinutes(-20), 0);
  assert.equal(snapMinutes(2000), 1435);
  assert.equal(snapMinutes(600, 870), 870);
});

test('time until leaving reads naturally', () => {
  assert.equal(untilWords(35, false), '35 min');
  assert.equal(untilWords(120, false), '2 h');
  assert.equal(untilWords(125, false), '2 h 5 min');
  assert.equal(untilWords(0, false), '0 min');
  assert.equal(untilWords(95, true), '1 س 35 د');
});

test('bars fill the half hours the server named', () => {
  const b = slotBars([{ slot: 14, riders: 3 }, { slot: 47, riders: 1 }, { slot: 60, riders: 9 }]);
  assert.equal(b.length, 48);
  assert.equal(b[14], 3);
  assert.equal(b[47], 1);
  assert.equal(b.reduce((a, x) => a + x, 0), 4);
  assert.equal(slotBars(null).every((x) => x === 0), true);
});

test('the month grid starts on Sunday and counts days from today', () => {
  // Wed 11 Nov 2026: November starts on a Sunday, so no blanks.
  const now = new Date(2026, 10, 11, 14, 0);
  const nov = monthCells(now, 0);
  assert.equal(nov.cells.length, 30);
  assert.equal(nov.cells[0], -10);
  assert.equal(nov.cells[10], 0);
  // December 2026 starts on a Tuesday: two blanks, then 1 Dec = today + 20.
  const dec = monthCells(now, 1);
  assert.deepEqual(dec.cells.slice(0, 3), [null, null, 20]);
});
