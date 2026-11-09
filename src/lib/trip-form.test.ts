/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clampSeats, departureFrom, parsePrice, parseTime, suggestedPrice } from './trip-form.ts';

test('parseTime accepts 24-hour times', () => {
  assert.deepEqual(parseTime('7:30'), { h: 7, m: 30 });
  assert.deepEqual(parseTime(' 18:05 '), { h: 18, m: 5 });
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('7:3'), null);
  assert.equal(parseTime('7pm'), null);
  assert.deepEqual(parseTime('٠٧:٣٠'), { h: 7, m: 30 });
});

test('departureFrom builds a future local time', () => {
  const now = new Date(2026, 10, 7, 9, 0); // 7 Nov, 09:00 local
  assert.deepEqual(departureFrom(1, '07:30', now), new Date(2026, 10, 8, 7, 30));
  assert.deepEqual(departureFrom(0, '15:00', now), new Date(2026, 10, 7, 15, 0));
});

test('departureFrom rejects times already past', () => {
  const now = new Date(2026, 10, 7, 9, 0);
  assert.equal(departureFrom(0, '08:59', now), null);
  assert.equal(departureFrom(0, '09:00', now), null);
});

test('parsePrice handles Western and Arabic digits', () => {
  assert.equal(parsePrice('25'), 25);
  assert.equal(parsePrice('22.5'), 22.5);
  assert.equal(parsePrice('٢٥'), 25);
  assert.equal(parsePrice('0'), null);
  assert.equal(parsePrice('500'), null);
  assert.equal(parsePrice('abc'), null);
});

test('clampSeats keeps seats between 1 and 6', () => {
  assert.equal(clampSeats(0), 1);
  assert.equal(clampSeats(3), 3);
  assert.equal(clampSeats(9), 6);
});

test('suggestedPrice follows distance, 25 for Ramallah - Nablus', async () => {
  const { placeKm, RAMALLAH, NABLUS } = await import('./places.ts');
  assert.equal(suggestedPrice(placeKm(RAMALLAH, NABLUS)), 25);
  assert.equal(suggestedPrice(2), 5);
  assert.equal(suggestedPrice(null), 25);
});
