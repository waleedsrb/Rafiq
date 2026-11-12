import assert from 'node:assert/strict';
import { test } from 'node:test';

import { accountSteps } from './account-steps.ts';

const done = { hasPhoto: true, id: 'approved', driver: 'approved', hasCar: true } as const;

test('everything done: no steps', () => {
  assert.deepEqual(accountSteps(done), []);
});

test('new passenger: photo then ID, no driver step without a car', () => {
  const s = accountSteps({ hasPhoto: false, id: 'none', driver: 'none', hasCar: false });
  assert.deepEqual(s.map((x) => x.key), ['photo', 'id']);
});

test('a step that is waiting or rejected stays, with its state', () => {
  const s = accountSteps({ ...done, id: 'pending', driver: 'rejected' });
  assert.deepEqual(s, [
    { key: 'id', state: 'pending' },
    { key: 'driver', state: 'rejected' },
  ]);
});

test('changing the car brings the driver step back', () => {
  assert.deepEqual(accountSteps({ ...done, driver: 'none' }), [{ key: 'driver', state: 'none' }]);
});

test('still loading: no check step flashes in', () => {
  assert.deepEqual(accountSteps({ ...done, id: null, driver: null }), []);
});
