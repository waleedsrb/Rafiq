import assert from 'node:assert/strict';
import { test } from 'node:test';

import { base64ToBytes } from './base64.ts';

test('decodes base64 the same way Node does', () => {
  for (const text of ['', 'R', 'Ra', 'Raf', 'Rafiq', 'رفيق ride', '\u0000ÿ binary']) {
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    assert.deepEqual(Buffer.from(base64ToBytes(b64)), Buffer.from(text, 'utf8'));
  }
});

test('ignores line breaks', () => {
  const b64 = Buffer.from('hello world').toString('base64');
  assert.equal(Buffer.from(base64ToBytes(b64.slice(0, 6) + '\n' + b64.slice(6))).toString(), 'hello world');
});
