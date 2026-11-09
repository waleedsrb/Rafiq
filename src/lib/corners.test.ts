import assert from 'node:assert/strict';
import { test } from 'node:test';

import { concentric, cornersFor, screenCornerRadius } from './corners.ts';

test('known iPhones get their display radius, in either orientation', () => {
  assert.equal(screenCornerRadius(393, 852, true), 55); // 15 / 16
  assert.equal(screenCornerRadius(852, 393, true), 55);
  assert.equal(screenCornerRadius(402, 874, true), 62); // 16 Pro
});

test('a home-button phone has square corners; an unknown rounded one gets the fallback', () => {
  assert.equal(screenCornerRadius(375, 667, false), 0);
  assert.equal(screenCornerRadius(412, 915, true), 47);
});

test('a nested shape loses the gap from its radius, never below the floor', () => {
  assert.equal(concentric(55, 8), 47);
  assert.equal(concentric(20, 30, 4), 4);
});

test('a floating card follows the screen corner; a capsule sits where its ends do too', () => {
  const c = cornersFor(393, 852, true);
  assert.equal(c.card, 47);
  assert.equal(c.capsuleInset(64), 23); // 55 - 32: the 64pt bar's ends run parallel to the glass
  const square = cornersFor(375, 667, false);
  assert.equal(square.card, 28);
  assert.equal(square.capsuleInset(64), 12);
});
