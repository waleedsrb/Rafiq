/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizePhone } from './phone.ts';

test('local numbers get the +970 prefix', () => {
  assert.equal(normalizePhone('0591234567'), '+970591234567');
  assert.equal(normalizePhone('056 123 4567'), '+970561234567');
  assert.equal(normalizePhone('059-123-4567'), '+970591234567');
});

test('international numbers keep their prefix', () => {
  assert.equal(normalizePhone('+970591234567'), '+970591234567');
  assert.equal(normalizePhone('+972 59 123 4567'), '+972591234567');
  assert.equal(normalizePhone('00970591234567'), '+970591234567');
});

test('Arabic-Indic digits work too', () => {
  assert.equal(normalizePhone('٠٥٩١٢٣٤٥٦٧'), '+970591234567');
});

test('anything else is rejected', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('0221234567'), null); // landline
  assert.equal(normalizePhone('05912345678'), null); // one digit too many
});
