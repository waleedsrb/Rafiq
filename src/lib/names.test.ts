/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { carName, shortName } from './names.ts';

test('first name and last initial', () => {
  assert.equal(shortName('وليد برغوثي'), 'وليد ب.');
  assert.equal(shortName('  Mohammad  Al Awad '), 'Mohammad A.');
  assert.equal(shortName('Dana'), 'Dana');
  assert.equal(shortName(' '), '');
});

test('a short name from the server stays the same', () => {
  // Other people's names arrive already shortened (profiles.display_name).
  assert.equal(shortName('Dana H.'), 'Dana H.');
  assert.equal(shortName('وليد ب.'), 'وليد ب.');
});

test('car name puts the colour where each language expects it', () => {
  assert.equal(carName('Kia Picanto', 'White', 'en'), 'White Kia Picanto');
  assert.equal(carName('كيا بيكانتو', 'أبيض', 'ar'), 'كيا بيكانتو أبيض');
  assert.equal(carName('Kia Picanto', null, 'en'), 'Kia Picanto');
  assert.equal(carName(null, 'White', 'en'), '');
});
