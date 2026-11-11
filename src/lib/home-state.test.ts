/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { drivePhase, heroLink, pickHero, seatPhase, sortRequests, usualDay, usualTime, type HomeInput } from './home-state.ts';

const now = new Date('2026-11-09T05:00:00Z');
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
const none: HomeInput = {
  seats: [],
  drives: [],
  requests: [],
  cancelled: null,
  rate: null,
  dismissed: new Set(),
  prefersDriving: false,
};
const seat = { bookingId: 'b1', tripId: 't1', status: 'accepted' as const, departsAt: at(240), startedAt: null };
const drive = { tripId: 't2', departsAt: at(120), startedAt: null, riders: 1 };
const request = { bookingId: 'r1', tripId: 't3', respondBy: at(90), createdAt: at(-30), fits: true };

test('nothing booked follows the role you used last', () => {
  assert.equal(pickHero(none, now).kind, 'idlePassenger');
  assert.equal(pickHero({ ...none, prefersDriving: true }, now).kind, 'idleDriver');
});

test('the soonest commitment wins, seat or drive', () => {
  assert.equal(pickHero({ ...none, seats: [seat], drives: [drive] }, now).kind, 'drive');
  const later = { ...drive, departsAt: at(300) };
  assert.equal(pickHero({ ...none, seats: [seat], drives: [later] }, now).kind, 'seat');
});

test('a request to answer beats a sooner seat, but not pickup time', () => {
  assert.deepEqual(pickHero({ ...none, seats: [seat], requests: [request] }, now), { kind: 'request', request, count: 1 });
  const soon = { ...seat, departsAt: at(20) };
  assert.equal(pickHero({ ...none, seats: [soon], requests: [request] }, now).kind, 'seat');
});

test('requests: the soonest deadline across trips first, then whoever asked first', () => {
  const tomorrowButUrgent = { ...request, bookingId: 'r2', tripId: 't9', respondBy: at(20) };
  const sameDeadlineEarlier = { ...request, bookingId: 'r3', createdAt: at(-60) };
  const gone = { ...request, bookingId: 'r4', respondBy: at(-1) };
  assert.deepEqual(
    sortRequests([request, gone, sameDeadlineEarlier, tomorrowButUrgent], now).map((r) => r.bookingId),
    ['r2', 'r3', 'r1'],
  );
  const h = pickHero({ ...none, requests: [request, tomorrowButUrgent, gone] }, now);
  assert.equal(h.kind === 'request' && h.request.bookingId, 'r2');
  assert.equal(h.kind === 'request' && h.count, 2);
});

test('a trip on the road beats everything', () => {
  const rolling = { ...seat, startedAt: at(-10) };
  const h = pickHero({ ...none, seats: [rolling], rate: { bookingId: 'b9', finishedAt: 'x' }, requests: [request] }, now);
  assert.equal(h.kind === 'seat' && h.phase, 'onTheRoad');
});

test('an overdue drive beats pickup time and requests', () => {
  const overdue = { ...drive, departsAt: at(-25) };
  const soon = { ...seat, departsAt: at(10) };
  const h = pickHero({ ...none, seats: [soon], drives: [overdue], requests: [request] }, now);
  assert.equal(h.kind === 'drive' && h.phase, 'overdue');
});

test('cancelled and rate cards can be put off with Later', () => {
  const cancelled = { bookingId: 'b5', tripId: 't5', departsAt: at(180) };
  assert.equal(pickHero({ ...none, cancelled }, now).kind, 'cancelled');
  assert.equal(pickHero({ ...none, cancelled, dismissed: new Set(['b5']) }, now).kind, 'idlePassenger');
  const rate = { bookingId: 'b6', finishedAt: at(-60) };
  assert.equal(pickHero({ ...none, rate }, now).kind, 'rate');
  assert.equal(pickHero({ ...none, rate, dismissed: new Set(['b6']) }, now).kind, 'idlePassenger');
});

test('seat phases through trip day', () => {
  assert.equal(seatPhase({ ...seat, status: 'requested' }, now), 'waiting');
  assert.equal(seatPhase(seat, now), 'confirmed');
  assert.equal(seatPhase({ ...seat, departsAt: at(45) }, now), 'soon');
  assert.equal(seatPhase({ ...seat, departsAt: at(-10) }, now), 'late');
  assert.equal(seatPhase({ ...seat, departsAt: at(-50) }, now), 'askRide');
  // In the car (your answer or the driver's tick): no question, the trip counts as ridden.
  assert.equal(seatPhase({ ...seat, departsAt: at(-50), boardedAt: at(-40) }, now), 'late');
  // Answered, or past the 3 hours: nothing left to show.
  assert.equal(seatPhase({ ...seat, departsAt: at(-50), riderAnswer: 'rode' }, now), null);
  assert.equal(seatPhase({ ...seat, departsAt: at(-50), riderAnswer: 'didnt_go' }, now), null);
  assert.equal(seatPhase({ ...seat, departsAt: at(-181) }, now), null);
});

test('drive phases through trip day', () => {
  assert.equal(drivePhase(drive, now), 'ready');
  assert.equal(drivePhase({ ...drive, departsAt: at(-10) }, now), 'ready');
  assert.equal(drivePhase({ ...drive, departsAt: at(-15) }, now), 'overdue');
  assert.equal(drivePhase({ ...drive, departsAt: at(-15), noGoReason: 'nobody_came' }, now), null);
  assert.equal(drivePhase({ ...drive, departsAt: at(-15), riders: 0 }, now), null);
  assert.equal(drivePhase({ ...drive, departsAt: at(-181) }, now), null);
  assert.equal(drivePhase({ ...drive, departsAt: at(-200), startedAt: at(-190) }, now), 'onTheRoad');
});

test('an answered seat steps aside for the next one', () => {
  const answered = { ...seat, bookingId: 'b7', departsAt: at(-50), riderAnswer: 'rode' as const };
  const h = pickHero({ ...none, seats: [answered, seat] }, now);
  assert.equal(h.kind === 'seat' && h.seat.bookingId, 'b1');
});

test('every hero with a page opens it', () => {
  assert.deepEqual(heroLink({ kind: 'seat', phase: 'confirmed', seat }), { pathname: '/trips/[id]', params: { id: 't1' } });
  assert.deepEqual(heroLink({ kind: 'drive', phase: 'ready', drive }), { pathname: '/trips/requests/[id]', params: { id: 't2' } });
  assert.deepEqual(heroLink({ kind: 'request', request, count: 1 }), { pathname: '/trips/requests/[id]', params: { id: 't3' } });
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
