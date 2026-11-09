import assert from 'node:assert/strict';
import { test } from 'node:test';

import { plateKind, plateSvg } from './plate-svg.ts';

test('recognises West Bank and Israeli plates', () => {
  assert.equal(plateKind('4-2718-H'), 'ps');
  assert.equal(plateKind('482-17-305'), 'il');
  assert.equal(plateKind('12-345-67'), 'il');
  assert.equal(plateKind('ABC123'), null);
});

test('draws a plate for any number in a known format', () => {
  const ps = plateSvg('7-1234-K');
  assert.ok(ps?.startsWith('<svg'));
  // 6 serial characters + the P on the panel, each with its own clip.
  assert.equal(ps?.match(/<clipPath/g)?.length, 7);
  assert.ok(plateSvg('482-17-305')?.includes('#F7C21B'));
  assert.ok(plateSvg('12-345-67'));
});

test('gives up on letters it has no glyph for, so the app can fall back to text', () => {
  assert.equal(plateSvg('7-1234-Q'), null);
  assert.equal(plateSvg('hello'), null);
});
