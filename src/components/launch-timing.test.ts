import assert from 'node:assert/strict';
import test from 'node:test';

import { REVEAL_END } from './intro-motion.ts';
import { launchDuration, launchSceneTime } from './launch-timing.ts';

test('first launch keeps the full choreography; returning launches take 1.8 seconds', () => {
  assert.equal(launchDuration('full', false), 6700);
  assert.equal(launchDuration('short', false), 1800);
  assert.equal(launchSceneTime(0, 'full'), 0);
  assert.equal(launchSceneTime(3500, 'full'), 3500);
  assert.equal(launchSceneTime(6700, 'full'), REVEAL_END);
  assert.equal(launchSceneTime(400, 'short'), 3950);
  assert.equal(launchSceneTime(1800, 'short'), REVEAL_END);
});

test('short launch advances continuously without reversing or overshooting', () => {
  let previous = 0;
  for (let elapsed = 0; elapsed <= 2000; elapsed += 1) {
    const current = launchSceneTime(elapsed, 'short');
    assert.ok(current >= previous && current <= REVEAL_END);
    assert.ok(current - previous < 10);
    previous = current;
  }
});

test('reduced motion removes the animation delay for both launch modes', () => {
  assert.equal(launchDuration('full', true), 0);
  assert.equal(launchDuration('short', true), 0);
});
