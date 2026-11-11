/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { seatView } from './seat-line.ts';

test('an empty trip: every seat free, ask', () => {
  assert.deepEqual(seatView(3, { confirmed: 0, waiting: 0, in_line: 0, line_room: 2 }), {
    free: 3,
    seats: ['free', 'free', 'free'],
    action: 'ask',
  });
});

test('confirmed first, then waiting, then free', () => {
  const v = seatView(3, { confirmed: 1, waiting: 1, in_line: 0, line_room: 2 });
  assert.deepEqual(v.seats, ['confirmed', 'waiting', 'free']);
  assert.equal(v.free, 1);
  assert.equal(v.action, 'ask');
});

test('all seats held: join the line while it has room', () => {
  assert.equal(seatView(2, { confirmed: 1, waiting: 1, in_line: 1, line_room: 1 }).action, 'line');
});

test('seats and line both full', () => {
  assert.equal(seatView(2, { confirmed: 2, waiting: 0, in_line: 2, line_room: 0 }).action, 'full');
});

test('counts not loaded yet: show free seats, no line', () => {
  assert.deepEqual(seatView(2, null), { free: 2, seats: ['free', 'free'], action: 'ask' });
});

test('odd numbers (driver lowered seats) never break the row', () => {
  const v = seatView(2, { confirmed: 3, waiting: 1, in_line: 0, line_room: 2 });
  assert.deepEqual(v.seats, ['confirmed', 'confirmed']);
  assert.equal(v.action, 'line');
});
