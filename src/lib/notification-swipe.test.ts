/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampNotificationSwipe, notificationSwipeArmed, notificationSwipeMetrics, notificationSwipeResult } from './notification-swipe.ts';

test('short swipe closes, partial swipe reveals, full release performs one action', () => {
  assert.deepEqual(notificationSwipeResult(20, 400, false, true), { action: null, offset: 0 });
  assert.deepEqual(notificationSwipeResult(100, 400, false, true), { action: null, offset: 80 });
  assert.deepEqual(notificationSwipeResult(240, 400, false, true), { action: 'read', offset: 0 });
  assert.deepEqual(notificationSwipeResult(239, 400, false, true), { action: null, offset: 80 });
  assert.deepEqual(notificationSwipeResult(-240, 400, false, true), { action: 'delete', offset: 0 });
});

test('crossing the threshold then retreating only reveals; a canceled full swipe never acts', () => {
  assert.equal(notificationSwipeResult(-350, 400, false, true).action, 'delete');
  assert.deepEqual(notificationSwipeResult(-170, 400, false, true), { action: null, offset: -80 });
  assert.deepEqual(notificationSwipeResult(-350, 400, false, true, true), { action: null, offset: 0 });
});

test('a further swipe from an already revealed action uses total final offset', () => {
  const revealed = notificationSwipeResult(-100, 400, false, true).offset;
  assert.equal(notificationSwipeResult(revealed - 100, 400, false, true).action, null);
  assert.equal(notificationSwipeResult(revealed - 180, 400, false, true).action, 'delete');
  assert.deepEqual(notificationSwipeResult(revealed + 100, 400, false, true), { action: null, offset: 0 });
});

test('RTL mirrors actions, already-read rows cannot reveal or execute Read', () => {
  assert.equal(notificationSwipeResult(-300, 400, true, true).action, 'read');
  assert.equal(notificationSwipeResult(300, 400, true, true).action, 'delete');
  assert.deepEqual(notificationSwipeResult(350, 400, false, false), { action: null, offset: 0 });
  assert.deepEqual(notificationSwipeResult(-350, 400, true, false), { action: null, offset: 0 });
});

test('threshold follows the measured row width; partial snap never arms a full swipe', () => {
  for (const width of [160, 320, 800]) {
    const { reveal, full } = notificationSwipeMetrics(width);
    assert.ok(reveal < full);
    assert.equal(notificationSwipeResult(reveal, width, false, true).action, null);
    assert.equal(notificationSwipeResult(full - 1, width, false, true).action, null);
    assert.equal(notificationSwipeResult(full, width, false, true).action, 'read');
    assert.equal(clampNotificationSwipe(width * 2, width, false, true), width);
  }
  assert.deepEqual(notificationSwipeResult(300, 0, false, true), { action: null, offset: 0 });
});

test('arming at 60% matches what release performs, mirrored in Arabic', () => {
  assert.equal(notificationSwipeArmed(240, 400, false, true), 'read');
  assert.equal(notificationSwipeArmed(-240, 400, true, true), 'read');
  assert.equal(notificationSwipeArmed(239, 400, false, true), null);
  assert.equal(notificationSwipeArmed(300, 400, false, false), null);
  assert.equal(notificationSwipeArmed(300, 0, false, true), null);
});
