/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { notificationIdFromPush, applyInboxChange, groupInbox, inboxIcon, needsYou, type Notification } from './inbox.ts';

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


test('reading one message preserves other unread messages and the original read time', () => {
  const at = new Date('2026-11-09T08:00:00Z');
  const rows = [row(1, at), row(2, at), row(3, at, 'requested', true)];
  const read = applyInboxChange(rows, { type: 'read', id: 1, readAt: '2026-11-09T09:00:00Z' });
  assert.equal(read[0].read_at, '2026-11-09T09:00:00Z');
  assert.equal(read[1].read_at, null);
  assert.equal(rows[0].read_at, null);
  assert.equal(applyInboxChange(read, { type: 'read', id: 3, readAt: 'later' })[2].read_at, at.toISOString());
});

test('deleting one message retains unrelated messages and removes an empty group', () => {
  const now = new Date(2026, 10, 9, 10);
  const old = row(1, new Date(2026, 10, 1));
  const today = row(2, now);
  const remaining = applyInboxChange([old, today], { type: 'delete', id: 2 });
  assert.deepEqual(remaining, [old]);
  assert.deepEqual(groupInbox(remaining, now).map((g) => g.group), ['earlier']);
  assert.deepEqual(applyInboxChange(remaining, { type: 'delete', id: 999 }), remaining);
});


test('push reads only an explicit valid id, preserving bigint precision', () => {
  assert.equal(notificationIdFromPush('9223372036854775807'), '9223372036854775807');
  assert.equal(notificationIdFromPush(42), '42');
  for (const invalid of [null, undefined, '', '0', '-1', '12oops', 1.5, Number.MAX_SAFE_INTEGER + 1, {}]) {
    assert.equal(notificationIdFromPush(invalid), null);
  }
});

test('a failed change can be put back exactly, and mark all keeps earlier read times', () => {
  const at = new Date('2026-11-09T08:00:00Z');
  const rows = [row(3, at), row(2, new Date('2026-11-08T08:00:00Z'), 'accepted', true), row(1, new Date('2026-11-07T08:00:00Z'))];
  const gone = applyInboxChange(rows, { type: 'delete', id: 2 });
  assert.deepEqual(applyInboxChange(gone, { type: 'restore', row: rows[1] }).map((n) => n.id), [3, 2, 1]);
  assert.equal(applyInboxChange(rows, { type: 'restore', row: rows[1] }).length, 3);
  const read = applyInboxChange(rows, { type: 'read', id: 3, readAt: 'now' });
  assert.equal(applyInboxChange(read, { type: 'unread', id: 3 })[0].read_at, null);
  const all = applyInboxChange(rows, { type: 'readAll', readAt: 'now' });
  assert.deepEqual(all.map((n) => n.read_at), ['now', rows[1].read_at, 'now']);
});
