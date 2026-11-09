/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centreName, NABLUS, onRamallahNablusRoad, place, placeName, RAMALLAH, routeName } from './places.ts';

test('names come from the bundled West Bank places, old ids still work', () => {
  assert.equal(placeName(RAMALLAH, 'en'), 'Ramallah');
  assert.equal(placeName('nablus', 'ar'), 'نابلس');
  assert.equal(place('ramallah')?.id, RAMALLAH);
  assert.equal(placeName('osm-nothing', 'en'), '');
  assert.equal(routeName(RAMALLAH, NABLUS, 'en'), 'Ramallah → Nablus');
});

test('town centres: the famous squares, or "<town> centre"', () => {
  assert.equal(centreName(RAMALLAH, 'en'), 'Al-Manara Square');
  assert.equal(centreName('osm-n246843682', 'en'), 'Bitunia centre');
});

test('the four hand-placed checkpoints only belong to trips along the Ramallah - Nablus road', () => {
  assert.equal(onRamallahNablusRoad(RAMALLAH, NABLUS), 'forward');
  assert.equal(onRamallahNablusRoad('osm-n246843682', NABLUS), 'forward'); // Bitunia, next to Ramallah
  assert.equal(onRamallahNablusRoad(NABLUS, RAMALLAH), 'back');
  assert.equal(onRamallahNablusRoad(RAMALLAH, 'osm-a13519431'), null); // Bethlehem
});
