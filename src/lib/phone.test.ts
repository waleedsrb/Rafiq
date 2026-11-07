/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatPhone, normalizeContactPhone, normalizePhone, telLink } from './phone.ts';

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

test('stored numbers display nicely and dial correctly', () => {
  assert.equal(formatPhone('970591234567'), '+970 59 123 4567');
  assert.equal(formatPhone('+972561234567'), '+972 56 123 4567');
  assert.equal(telLink('970591234567'), 'tel:+970591234567');
});

test('emergency contacts can be local or from any country', () => {
  assert.equal(normalizeContactPhone('0591234567'), '+970591234567');
  assert.equal(normalizeContactPhone('+962 79 123 4567'), '+962791234567');
  assert.equal(normalizeContactPhone('00962791234567'), '+962791234567');
  assert.equal(normalizeContactPhone('٠٥٩١٢٣٤٥٦٧'), '+970591234567');
  assert.equal(normalizeContactPhone('12345'), null);
  assert.equal(normalizeContactPhone('+0123456789'), null);
});
