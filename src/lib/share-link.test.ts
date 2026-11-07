/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shareUrl, smsLink } from './share-link.ts';

test('share links point at the family page, in the right language', () => {
  assert.equal(shareUrl('abc123', 'ar'), 'https://waleedsrb.github.io/Rafiq/share.html?t=abc123');
  assert.equal(shareUrl('abc123', 'en'), 'https://waleedsrb.github.io/Rafiq/share.html?t=abc123&lang=en');
});

test('sms links differ on iOS and Android, and encode the text', () => {
  assert.equal(smsLink('+970591111111', 'Help me', 'ios'), 'sms:+970591111111&body=Help%20me');
  assert.equal(smsLink('+970591111111', 'Help me', 'android'), 'sms:+970591111111?body=Help%20me');
});
