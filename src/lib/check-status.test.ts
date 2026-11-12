import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkStatus, slotsFor } from './check-status.ts';

const base = { idVerifiedAt: null, car: null, last: null };

test('nobody has asked yet', () => {
  assert.deepEqual(checkStatus({ ...base, kind: 'passenger' }), { state: 'none', reason: null, hasCar: false });
});

test('a passenger is approved once their ID is verified', () => {
  const s = checkStatus({ ...base, kind: 'passenger', idVerifiedAt: '2026-11-11T10:00:00Z' });
  assert.equal(s.state, 'approved');
});

test('a waiting request shows as pending', () => {
  const s = checkStatus({ ...base, kind: 'passenger', last: { status: 'pending', reject_reason: null } });
  assert.equal(s.state, 'pending');
});

test('a rejection carries its reason', () => {
  const s = checkStatus({ ...base, kind: 'driver', car: { verifiedAt: null }, last: { status: 'rejected', reject_reason: 'Blurry plate' } });
  assert.deepEqual(s, { state: 'rejected', reason: 'Blurry plate', hasCar: true });
});

test('a driver who changed car is no longer approved, despite the old approval', () => {
  // Changing the car clears driver_details.verified_at; the old request still says approved.
  const s = checkStatus({ ...base, kind: 'driver', car: { verifiedAt: null }, last: { status: 'approved', reject_reason: null } });
  assert.equal(s.state, 'none');
});

test('a verified ID does not make someone a verified driver', () => {
  const s = checkStatus({ ...base, kind: 'driver', idVerifiedAt: '2026-11-11T10:00:00Z', car: { verifiedAt: null } });
  assert.equal(s.state, 'none');
  assert.equal(s.hasCar, true);
});

test('a driver with a verified ID sends only licence and car', () => {
  assert.deepEqual(slotsFor('driver', true), ['licence', 'car']);
  assert.deepEqual(slotsFor('driver', false), ['id', 'licence', 'car']);
  assert.deepEqual(slotsFor('passenger', true), ['id']);
});
