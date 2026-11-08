/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { alertWindow } from './alerts.ts';

const day = new Date(2026, 10, 9); // Sun 9 Nov, local midnight
const early = new Date(2026, 10, 8, 20, 0);

test('a whole day runs midnight to midnight', () => {
  assert.deepEqual(alertWindow(day, null, early), { from: new Date(2026, 10, 9), to: new Date(2026, 10, 10) });
});

test('a part of the day uses the same hours as the filter chips', () => {
  assert.deepEqual(alertWindow(day, 'morning', early), { from: new Date(2026, 10, 9, 0), to: new Date(2026, 10, 9, 12) });
  assert.deepEqual(alertWindow(day, 'evening', early), { from: new Date(2026, 10, 9, 17), to: new Date(2026, 10, 10) });
});

test('nothing to wait for once the window is over', () => {
  assert.equal(alertWindow(day, 'morning', new Date(2026, 10, 9, 13)), null);
  assert.ok(alertWindow(day, 'evening', new Date(2026, 10, 9, 13)));
});
