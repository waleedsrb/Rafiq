/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { heroLink, pickHero, seatPhase, usualDay, usualTime, type HomeInput } from './home-state.ts';

const now = new Date('2026-11-09T05:00:00Z');
const none: HomeInput = {
  seat: null,
  drive: null,
  driveWithRequests: null,
  cancelled: null,
  rate: null,
  dismissed: new Set(),
  prefersDriving: false,
};
const seat = { bookingId: 'b1', tripId: 't1', status: 'accepted' as const, departsAt: '2026-11-09T09:00:00Z', startedAt: null };
const drive = { tripId: 't2', departsAt: '2026-11-09T07:00:00Z', startedAt: null, pending: 0 };

test('nothing booked follows the role you used last', () => {
  assert.equal(pickHero(none, now).kind, 'idlePassenger');
  assert.equal(pickHero({ ...none, prefersDriving: true }, now).kind, 'idleDriver');
});

test('the soonest commitment wins, seat or drive', () => {
  const h = pickHero({ ...none, seat, drive }, now);
  assert.equal(h.kind, 'drive');
  const later = { ...drive, departsAt: '2026-11-09T10:00:00Z' };
  assert.equal(pickHero({ ...none, seat, drive: later }, now).kind, 'seat');
});

test('a request to answer beats a sooner seat', () => {
  const asked = { ...drive, departsAt: '2026-11-10T07:00:00Z', pending: 1 };
  const h = pickHero({ ...none, seat, drive, driveWithRequests: asked }, now);
  assert.deepEqual(h, { kind: 'drive', phase: 'requests', drive: asked });
});

test('a trip on the road beats everything', () => {
  const rolling = { ...seat, startedAt: '2026-11-09T04:50:00Z' };
  const h = pickHero({ ...none, seat: rolling, rate: { bookingId: 'b9', finishedAt: 'x' } }, now);
  assert.equal(h.kind, 'seat');
  assert.equal(h.kind === 'seat' && h.phase, 'onTheRoad');
});

test('cancelled and rate cards can be put off with Later', () => {
  const cancelled = { bookingId: 'b5', tripId: 't5', departsAt: '2026-11-09T08:00:00Z' };
  assert.equal(pickHero({ ...none, cancelled }, now).kind, 'cancelled');
  assert.equal(pickHero({ ...none, cancelled, dismissed: new Set(['b5']) }, now).kind, 'idlePassenger');
  const rate = { bookingId: 'b6', finishedAt: '2026-11-09T04:00:00Z' };
  assert.equal(pickHero({ ...none, rate }, now).kind, 'rate');
  assert.equal(pickHero({ ...none, rate, dismissed: new Set(['b6']) }, now).kind, 'idlePassenger');
});

test('seat phases', () => {
  assert.equal(seatPhase({ ...seat, status: 'requested' }, now), 'waiting');
  assert.equal(seatPhase(seat, now), 'confirmed');
  assert.equal(seatPhase({ ...seat, departsAt: '2026-11-09T05:45:00Z' }, now), 'soon');
});

test('every hero with a page opens it', () => {
  assert.deepEqual(heroLink({ kind: 'seat', phase: 'confirmed', seat }), { pathname: '/trips/[id]', params: { id: 't1' } });
  assert.deepEqual(heroLink({ kind: 'drive', phase: 'ready', drive }), { pathname: '/trips/requests/[id]', params: { id: 't2' } });
  assert.deepEqual(heroLink({ kind: 'rate', rate: { bookingId: 'b6', finishedAt: 'x' } }), {
    pathname: '/trips/rate/[bookingId]',
    params: { bookingId: 'b6' },
  });
  assert.equal(heroLink({ kind: 'idlePassenger' }), null);
});

test('usual trip time and day', () => {
  const d = new Date(2026, 10, 9, 7, 5);
  assert.equal(usualTime(d.toISOString()), '07:05');
  assert.equal(usualDay('07:00', new Date(2026, 10, 9, 6, 0)), 0);
  assert.equal(usualDay('07:00', new Date(2026, 10, 9, 6, 45)), 1);
});
