// Where someone stands for an ID check, worked out from what the database returns.
// Kept free of React Native imports so it can be tested on its own.

export type CheckKind = 'passenger' | 'driver';
export type CheckState = 'none' | 'pending' | 'rejected' | 'approved';

/** Which photos each kind of check needs, in order. */
export const PHOTO_SLOTS = {
  passenger: ['id'],
  driver: ['id', 'licence', 'car'],
} as const satisfies Record<CheckKind, readonly string[]>;
export type PhotoSlot = (typeof PHOTO_SLOTS)[CheckKind][number];

export type CheckStatus = {
  state: CheckState;
  reason: string | null; // why it was rejected
  hasCar: boolean; // drivers need a car before asking for a check
};

/** The newest request of this kind, if any. */
export type LastRequest = { status: CheckState; reject_reason: string | null };

export function checkStatus(input: {
  kind: CheckKind;
  idVerifiedAt: string | null;
  car: { verifiedAt: string | null } | null;
  last: LastRequest | null;
}): CheckStatus {
  const { kind, idVerifiedAt, car, last } = input;
  const verified = kind === 'passenger' ? !!idVerifiedAt : !!car?.verifiedAt;
  return {
    // A driver who changed their car has an old "approved" request but isn't verified any more.
    state: verified ? 'approved' : last && last.status !== 'approved' ? last.status : 'none',
    reason: last?.status === 'rejected' ? last.reject_reason : null,
    hasCar: !!car,
  };
}
