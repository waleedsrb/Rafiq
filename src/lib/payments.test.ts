import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DECLINE_CARD, TEST_CARD, cardBrand, checkCard, expiryValid, fakeTokenize, formatCardNumber, formatExpiry, luhnValid } from './payments.ts';

const now = new Date(2026, 10, 7); // 7 Nov 2026

test('formats as you type', () => {
  assert.equal(formatCardNumber('4242424242424242'), '4242 4242 4242 4242');
  assert.equal(formatCardNumber('4242 42'), '4242 42');
  assert.equal(formatExpiry('1228'), '12/28');
  assert.equal(formatExpiry('1'), '1');
});

test('Luhn catches typos', () => {
  assert.equal(luhnValid(TEST_CARD), true);
  assert.equal(luhnValid(DECLINE_CARD), true);
  assert.equal(luhnValid('4242 4242 4242 4241'), false);
  assert.equal(luhnValid('4242'), false);
});

test('expiry: this month still works, last month does not', () => {
  assert.equal(expiryValid('11/26', now), true);
  assert.equal(expiryValid('10/26', now), false);
  assert.equal(expiryValid('13/30', now), false);
  assert.equal(expiryValid('1230', now), false);
});

test('names the first problem', () => {
  assert.equal(checkCard({ number: TEST_CARD, expiry: '12/28', cvc: '123' }, now), null);
  assert.equal(checkCard({ number: '1234', expiry: '12/28', cvc: '123' }, now), 'number');
  assert.equal(checkCard({ number: TEST_CARD, expiry: '01/20', cvc: '123' }, now), 'expiry');
  assert.equal(checkCard({ number: TEST_CARD, expiry: '12/28', cvc: '1' }, now), 'cvc');
});

test('brand and pretend tokens', () => {
  assert.equal(cardBrand('5555 5555 5555 4444'), 'mastercard');
  assert.equal(cardBrand(TEST_CARD), 'visa');
  const ok = fakeTokenize({ number: TEST_CARD, expiry: '12/28', cvc: '123' });
  assert.match(ok.token, /^tok_fake_4242[a-z0-9]+$/);
  assert.equal(ok.last4, '4242');
  assert.equal(fakeTokenize({ number: DECLINE_CARD, expiry: '12/28', cvc: '123' }).token, 'tok_fake_decline');
});
