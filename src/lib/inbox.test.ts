/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupInbox, inboxIcon, needsYou, type Notification } from './inbox.ts';

const row = (id: number, at: Date, kind = 'accepted', read = false): Notification => ({
  id,
  kind,
  title: 't',
  body: 'b',
  url: null,
  created_at: at.toISOString(),
  read_at: read ? at.toISOString() : null,
});

test('groups into today, this week and earlier, newest first', () => {
  const now = new Date(2026, 10, 7, 18, 0);
  const groups = groupInbox(
    [
      row(1, new Date(2026, 10, 7, 9, 0)),
      row(2, new Date(2026, 10, 7, 17, 0)),
      row(3, new Date(2026, 10, 6, 23, 59)),
      row(4, new Date(2026, 10, 1, 8, 0)),
      row(5, new Date(2026, 9, 31, 23, 0)),
    ],
    now,
  );
  assert.deepEqual(
    groups.map((g) => [g.group, g.rows.map((r) => r.id)]),
    [
      ['today', [2, 1]],
      ['week', [3, 4]],
      ['earlier', [5]],
    ],
  );
});

test('empty groups are left out', () => {
  const now = new Date(2026, 10, 7, 18, 0);
  assert.deepEqual(groupInbox([row(1, new Date(2026, 10, 7, 9, 0))], now).map((g) => g.group), ['today']);
  assert.deepEqual(groupInbox([], now), []);
});

test('icons follow the kind', () => {
  assert.equal(inboxIcon('requested'), 'ticket');
  assert.equal(inboxIcon('verification_approved'), 'shieldCheck');
  assert.equal(inboxIcon('checkpoint_closed'), 'barricade');
  assert.equal(inboxIcon('rate_driver'), 'star');
  assert.equal(inboxIcon('trip_cancelled'), 'x');
  assert.equal(inboxIcon('something_new'), 'clock');
});

test('clay only for unread messages that need you', () => {
  assert.equal(needsYou({ kind: 'requested', read_at: null }), true);
  assert.equal(needsYou({ kind: 'requested', read_at: '2026-11-07' }), false);
  assert.equal(needsYou({ kind: 'accepted', read_at: null }), false);
});
