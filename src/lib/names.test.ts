/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shortName } from './names.ts';

test('first name and last initial', () => {
  assert.equal(shortName('وليد برغوثي'), 'وليد ب.');
  assert.equal(shortName('  Mohammad  Al Awad '), 'Mohammad A.');
  assert.equal(shortName('Dana'), 'Dana');
  assert.equal(shortName(' '), '');
});
