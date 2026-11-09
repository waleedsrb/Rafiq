import assert from 'node:assert/strict';
import { test } from 'node:test';

import { arrivalAt, arriving, distanceParts, minutesLeft, nextOnRoad } from './drive.ts';

// Ramallah to Nablus, roughly north. Three made-up checkpoints along the way.
const ramallah = { latitude: 31.9038, longitude: 35.2034 };
const nablus = { latitude: 32.2211, longitude: 35.2544 };
const road = [
  { id: 'a', latitude: 31.98, longitude: 35.21 },
  { id: 'b', latitude: 32.07, longitude: 35.23 },
  { id: 'c', latitude: 32.18, longitude: 35.25 },
];

test('without a position, the next checkpoint is the first one', () => {
  assert.deepEqual(nextOnRoad(road, null, nablus), { point: road[0], meters: null });
});

test('the next checkpoint is the first one the car has not reached', () => {
  const car = { latitude: 32.0, longitude: 35.215 }; // just past a
  const next = nextOnRoad(road, car, nablus);
  assert.equal(next?.point.id, 'b');
  assert.ok(next!.meters! > 5000 && next!.meters! < 10000, `got ${next?.meters}`);
});

test('standing right at a checkpoint still shows it as next', () => {
  assert.equal(nextOnRoad(road, { latitude: 32.07, longitude: 35.23 }, nablus)?.point.id, 'b');
});

test('nothing is next once every checkpoint is behind', () => {
  assert.equal(nextOnRoad(road, { latitude: 32.21, longitude: 35.254 }, nablus), null);
  assert.equal(nextOnRoad([], null, nablus), null);
});

test('Ramallah to Nablus takes about an hour', () => {
  const m = minutesLeft(ramallah, nablus);
  assert.ok(m >= 45 && m <= 75, `got ${m}`);
});

test('arrival time comes from the position, or from the start without one', () => {
  const now = new Date('2026-11-09T14:00:00Z');
  const started = new Date('2026-11-09T13:30:00Z');
  const fromCar = arrivalAt(now, road[2], ramallah, nablus, started);
  assert.ok(fromCar.getTime() - now.getTime() < 15 * 60_000);
  const noCar = arrivalAt(now, null, ramallah, nablus, started);
  assert.equal(noCar.getTime(), started.getTime() + minutesLeft(ramallah, nablus) * 60_000);
  // Late with no position: never a time in the past.
  const late = arrivalAt(new Date('2026-11-09T16:00:00Z'), null, ramallah, nablus, started);
  assert.ok(late > new Date('2026-11-09T16:00:00Z'));
});

test('arriving only near the destination', () => {
  assert.equal(arriving({ latitude: 32.215, longitude: 35.254 }, nablus), true);
  assert.equal(arriving(road[1], nablus), false);
  assert.equal(arriving(null, nablus), false);
});

test('distances read the way a driver says them', () => {
  assert.deepEqual(distanceParts(310), { n: '300', unit: 'm' });
  assert.deepEqual(distanceParts(10), { n: '50', unit: 'm' });
  assert.deepEqual(distanceParts(4230), { n: '4.2', unit: 'km' });
  assert.deepEqual(distanceParts(4000), { n: '4', unit: 'km' });
  assert.deepEqual(distanceParts(11_400), { n: '11', unit: 'km' });
});
