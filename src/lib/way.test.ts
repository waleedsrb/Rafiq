import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkpointsNear, inDrivingOrder, onLine, tripCheckpoints } from './way.ts';

// Ramallah to Nablus, roughly north.
const ramallah = { latitude: 31.9038, longitude: 35.2034 };
const nablus = { latitude: 32.2211, longitude: 35.2544 };
const cp = (id: string, latitude: number, longitude: number) => ({ id, latitude, longitude });
const atara = cp('atara', 31.9855, 35.1968); // on the way, ~1.5 km west of the line
const zaatara = cp('zaatara', 32.1167, 35.2566); // on the way, ~2 km east
const huwara = cp('huwara', 32.153, 35.256);
const far = cp('far', 32.05, 35.32); // ~10 km east: not on the way
const side = cp('side', 32.05, 35.3); // ~7 km east: nearby, not suggested
const behind = cp('behind', 31.8, 35.19); // south of Ramallah: behind the start

test('onLine: start is 0, end is 1, sideways distance in km', () => {
  assert.equal(onLine(ramallah, nablus, ramallah).along, 0);
  assert.ok(Math.abs(onLine(ramallah, nablus, nablus).along - 1) < 1e-9);
  const z = onLine(ramallah, nablus, zaatara);
  assert.ok(z.along > 0.6 && z.along < 0.7, `along ${z.along}`);
  assert.ok(z.offKm > 1 && z.offKm < 3, `off ${z.offKm}`);
});

test('driving order flips with the direction', () => {
  const list = [huwara, atara, zaatara];
  assert.deepEqual(inDrivingOrder(ramallah, nablus, list).map((p) => p.id), ['atara', 'zaatara', 'huwara']);
  assert.deepEqual(inDrivingOrder(nablus, ramallah, list).map((p) => p.id), ['huwara', 'zaatara', 'atara']);
});

test('suggests the checkpoints near the way, offers the ones a bit further, skips the rest', () => {
  const { suggested, nearby } = checkpointsNear(ramallah, nablus, [far, huwara, side, behind, atara, zaatara]);
  assert.deepEqual(suggested.map((p) => p.id), ['atara', 'zaatara', 'huwara']);
  assert.deepEqual(nearby.map((p) => p.id), ['side']);
});

test("a trip's own list wins; older trips fall back to the old road, or nothing", () => {
  const all = [atara, zaatara, huwara, side];
  assert.deepEqual(tripCheckpoints(nablus, ramallah, ['atara', 'side'], all, [atara, zaatara]).map((p) => p.id), ['side', 'atara']);
  assert.deepEqual(tripCheckpoints(ramallah, nablus, [], all, [huwara, atara]).map((p) => p.id), ['atara', 'huwara']);
  assert.deepEqual(tripCheckpoints(ramallah, nablus, null, all, []), []);
});
