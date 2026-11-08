/// <reference types="node" />
// Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeEmail, oauthCode, providerNames } from './sign-in.ts';

test('emails are trimmed and lower-cased', () => {
  assert.equal(normalizeEmail('  Waleed@Gmail.COM '), 'waleed@gmail.com');
  assert.equal(normalizeEmail('a.b+rafiq@mail.ps'), 'a.b+rafiq@mail.ps');
});

test('things that cannot be an email are refused', () => {
  for (const bad of ['', 'waleed', 'waleed@', '@gmail.com', 'wal eed@gmail.com', 'waleed@gmail', 'waleed@gmail.c']) {
    assert.equal(normalizeEmail(bad), null, bad);
  }
});

test('the code comes out of the callback URL', () => {
  assert.equal(oauthCode('rafiq://auth-callback?code=abc123'), 'abc123');
  assert.equal(oauthCode('exp://192.168.1.5:8081/--/auth-callback?code=xyz#'), 'xyz');
});

test('an error in the callback means no code', () => {
  assert.equal(oauthCode('rafiq://auth-callback?error=access_denied&code=abc'), null);
  assert.equal(oauthCode('rafiq://auth-callback'), null);
});

test('names from Google or Apple', () => {
  assert.deepEqual(providerNames({ given_name: 'Waleed', family_name: 'Srb' }), { first: 'Waleed', last: 'Srb' });
  assert.deepEqual(providerNames({ full_name: 'Aya Abu Nasser' }), { first: 'Aya', last: 'Abu Nasser' });
  assert.deepEqual(providerNames({ name: 'Amir' }), { first: 'Amir', last: '' });
  assert.deepEqual(providerNames(undefined), { first: '', last: '' });
});
