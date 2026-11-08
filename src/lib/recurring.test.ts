/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WORK_WEEK, describeDays, toDbTime, toggleDay, weekdayName } from './recurring.ts';

test('toggleDay adds in order and never empties the week', () => {
  assert.deepEqual(toggleDay([0, 4], 2), [0, 2, 4]);
  assert.deepEqual(toggleDay([0, 2, 4], 2), [0, 4]);
  assert.deepEqual(toggleDay([3], 3), [3]);
});

test('describeDays names the common patterns', () => {
  assert.deepEqual(describeDays([4, 3, 2, 1, 0]), { kind: 'workWeek' });
  assert.deepEqual(describeDays([0, 1, 2, 3, 4, 5, 6]), { kind: 'daily' });
  assert.deepEqual(describeDays([4, 0, 0]), { kind: 'list', days: [0, 4] });
  assert.deepEqual(describeDays(WORK_WEEK), { kind: 'workWeek' });
});

test('weekdayName uses Sunday as day 0', () => {
  assert.equal(weekdayName(0, 'en'), 'Sun');
  assert.equal(weekdayName(4, 'en', 'long'), 'Thursday');
  assert.equal(weekdayName(5, 'ar', 'long'), 'الجمعة');
});

test('toDbTime pads', () => {
  assert.equal(toDbTime(7, 5), '07:05');
});
