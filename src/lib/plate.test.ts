/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizePlate } from './plate.ts';

test('plates in any spacing become one form', () => {
  assert.equal(normalizePlate('7-1234-95'), '7-1234-95');
  assert.equal(normalizePlate(' 7 1234 95 '), '7-1234-95');
  assert.equal(normalizePlate('٧-١٢٣٤-٩٥'), '7-1234-95');
  assert.equal(normalizePlate('12-345-67'), '12-345-67');
  assert.equal(normalizePlate('ab 123'), 'AB-123');
});

test('nonsense plates are rejected', () => {
  assert.equal(normalizePlate(''), null);
  assert.equal(normalizePlate('12'), null);
  assert.equal(normalizePlate('رام الله'), null);
});
