/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isNew, ratingText, reliabilityText, tripsKey, type Stats } from './stats.ts';

const base: Stats = { completed_trips: 0, rating_avg: null, rating_count: 0, reliability: null, founding_driver: false };

test('a new person has no rating and no reliability', () => {
  assert.equal(isNew(base), true);
  assert.equal(ratingText(base), null);
  assert.equal(reliabilityText(base), null);
});

test('numbers arrive as strings from Postgres and are shown rounded', () => {
  const s = { ...base, completed_trips: 12, rating_avg: '4.8', rating_count: 9, reliability: '0.96' };
  assert.equal(isNew(s), false);
  assert.equal(ratingText(s), '4.8');
  assert.equal(reliabilityText(s), '96%');
  assert.equal(ratingText({ ...s, rating_avg: '5' }), '5.0');
});

test('a no-show with no completed trips is not "new"', () => {
  assert.equal(isNew({ ...base, reliability: '0' }), false);
  assert.equal(reliabilityText({ ...base, reliability: '0' }), '0%');
});

test('Arabic plural for 3 to 10 trips', () => {
  assert.deepEqual([1, 2, 3, 10, 11, 120].map(tripsKey), ['tripsWord', 'tripsWord', 'tripsWordFew', 'tripsWordFew', 'tripsWord', 'tripsWord']);
});
