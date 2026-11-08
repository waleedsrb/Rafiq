import assert from 'node:assert/strict';
import test from 'node:test';

import { ROAD_CONTOUR, ROAD_DISTANCE } from './intro-contours.ts';
import { expandedInk, INTRO_END, progress, REVEAL_END, ROAD_CUTOUT, roadDrawing, sceneTransform, UI_START } from './intro-motion.ts';

test('the road starts empty and completes before the pullback', () => {
  assert.equal(roadDrawing(0), '');
  assert.equal(roadDrawing(350), '');
  assert.equal(roadDrawing(3950), ROAD_CUTOUT);
  assert.equal(roadDrawing(4200), ROAD_CUTOUT);
});

test('paired contours advance in order without invalid coordinates', () => {
  let distance = -1;
  for (const row of ROAD_CONTOUR) {
    assert.equal(row.length, 5);
    assert.ok(row.every(Number.isFinite));
    assert.ok(row[4] > distance);
    distance = row[4];
  }
  assert.equal(distance, ROAD_DISTANCE);
  for (let time = 351; time < 3950; time += 17) {
    const d = roadDrawing(time);
    assert.ok(d.startsWith('M') && d.endsWith('Z'));
    assert.doesNotMatch(d, /NaN|Infinity/);
  }
});

test('the camera stays still during drawing and reaches the exact logo placement', () => {
  assert.deepEqual(sceneTransform(0, 290), sceneTransform(4200, 290));
  const final = sceneTransform(REVEAL_END, 290);
  assert.ok(Math.abs(final.scale - 0.225) < 1e-10);
  assert.ok(Math.abs(final.x + 377 * final.scale - 180) < 1e-10);
  assert.ok(Math.abs(final.y + 364.5 * final.scale - 290) < 1e-10);
  let previous = 2.5;
  for (let time = 4200; time <= INTRO_END; time += 17) {
    const { scale } = sceneTransform(time, 290);
    assert.ok(scale <= previous && scale >= 0.225 - 1e-10);
    previous = scale;
  }
});

test('motion settles before controls appear, including the reduced-motion endpoint', () => {
  assert.ok(UI_START > REVEAL_END);
  assert.equal(progress(INTRO_END, UI_START, UI_START + 550), 1);
  assert.equal(progress(-100, UI_START, UI_START + 550), 0);
  assert.doesNotMatch(expandedInk(0), /NaN|Infinity/);
  assert.doesNotMatch(expandedInk(REVEAL_END), /NaN|Infinity/);
});
