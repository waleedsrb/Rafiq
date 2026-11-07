/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatStats } from './profile-stats.ts';

const base = { completed_trips: 12, rating_avg: '4.857', rating_count: 7, reliability: '1.0', founding_driver: false };

test('numbers as on the profile mockup', () => {
  assert.deepEqual(formatStats(base), { trips: '12', reliability: '100%', rating: '4.9' });
});

test('dashes before there is anything to show', () => {
  assert.deepEqual(formatStats({ ...base, completed_trips: 0, rating_avg: null, rating_count: 0, reliability: null }), {
    trips: '0',
    reliability: '–',
    rating: '–',
  });
});

test('reliability given as a percentage also works', () => {
  assert.equal(formatStats({ ...base, reliability: 87.4 }).reliability, '87%');
});
