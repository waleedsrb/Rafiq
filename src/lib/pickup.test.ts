import assert from 'node:assert/strict';
import { test } from 'node:test';

import { distanceM, labelOk, movePickup, offerSpots, spotAt, type Spot } from './pickup.ts';

const manara = { label: 'Al-Manara Square', latitude: 31.9038, longitude: 35.2034 };
const clock = { label: 'Clock Square', latitude: 31.9065, longitude: 35.2044 };
const spots: Spot[] = [
  { ...manara, kind: 'centre' },
  { ...clock, kind: 'popular' },
];

test('distance between two Ramallah squares is a few hundred metres', () => {
  const d = distanceM(manara, clock);
  assert.ok(d > 250 && d < 400, `got ${d}`);
  assert.equal(distanceM(manara, manara), 0);
});

test('a pin within 40 m lands on the spot', () => {
  assert.equal(spotAt(spots, { latitude: 31.9039, longitude: 35.2035 })?.label, 'Al-Manara Square');
  assert.equal(spotAt(spots, { latitude: 31.91, longitude: 35.21 }), null);
});

test('moving off a named spot clears the name; moving your own pin keeps your words', () => {
  const away = { latitude: 31.91, longitude: 35.21 };
  assert.equal(movePickup(manara, away, spots).label, '');
  const mine = { label: 'By the bakery', latitude: 31.905, longitude: 35.205 };
  assert.deepEqual(movePickup(mine, away, spots), { label: 'By the bakery', ...away });
  assert.equal(movePickup(mine, { latitude: 31.90651, longitude: 35.20441 }, spots).label, 'Clock Square');
});

test('labels need 2 to 80 characters', () => {
  assert.equal(labelOk(' a '), false);
  assert.equal(labelOk('Al-Manara'), true);
  assert.equal(labelOk('x'.repeat(81)), false);
});

test('offered spots: usual first, no near-duplicates, at most three', () => {
  const usual = { label: 'Manara, by the bakery', latitude: 31.90385, longitude: 35.20345 };
  const far = { label: 'Bus station', latitude: 31.9, longitude: 35.21 };
  const out = offerSpots(usual, [clock, far], manara);
  assert.deepEqual(
    out.map((s) => [s.label, s.kind]),
    [
      ['Manara, by the bakery', 'usual'],
      ['Clock Square', 'popular'],
      ['Bus station', 'popular'],
    ],
  );
  assert.deepEqual(offerSpots(null, [], manara).map((s) => s.kind), ['centre']);
});
