// What the top of Home shows. One card, first match wins. The order is about who is
// waiting on you and what runs out first (Nov 11, "Handle trips that never start"):
//   1. A trip on the road right now (driving beats riding).
//   2. Your drive is overdue: past departure, not started. Riders are waiting on you.
//   3. Pickup time: from an hour before departure until the trip starts.
//   4. Did you ride? A rider whose trip never started in the app.
//   5. A seat request to answer (the one whose deadline comes first, across all your trips).
//   6. A driver who cancelled your seat.
//   7. A trip to rate.
//   8. Your soonest commitment: the seat you booked or the trip you drive.
//   9. Nothing booked or posted: the role you used last.
// Each hero opens its own screen (heroLink). Questions with fixed answers and a deadline
// are answered right on the card (home-hero.tsx), everything else on that screen.

import { ASK_RIDE_AFTER_MIN, OVERDUE_AFTER_MIN, SETTLE_AFTER_HOURS } from './trip-day.ts';

export type RiderAnswer = 'in_car' | 'rode' | 'driver_absent' | 'didnt_go';

export type SeatHero = {
  bookingId: string;
  tripId: string;
  status: 'requested' | 'accepted';
  departsAt: string;
  startedAt: string | null;
  hereAt?: string | null;
  boardedAt?: string | null;
  riderAnswer?: RiderAnswer | null;
};

export type DriveHero = {
  tripId: string;
  departsAt: string;
  startedAt: string | null;
  /** Confirmed riders (seats accepted). */
  riders: number;
  /** The driver said the trip didn't happen. */
  noGoReason?: string | null;
};

export type RequestHero = {
  bookingId: string;
  tripId: string;
  respondBy: string;
  createdAt: string;
  /** False when the car no longer has room for this request. */
  fits: boolean;
};

export type CancelledHero = { bookingId: string; tripId: string; departsAt: string };
export type RateHero = { bookingId: string; finishedAt: string };

export type HomeInput = {
  /** Your seats that haven't finished, any order. */
  seats: SeatHero[];
  /** Trips you drive that haven't finished, any order. */
  drives: DriveHero[];
  /** Requests waiting for your answer, on any of your trips. */
  requests: RequestHero[];
  cancelled: CancelledHero | null;
  rate: RateHero | null;
  /** Hero cards the person closed with "Later" (booking ids). */
  dismissed: ReadonlySet<string>;
  /** True when the person's most recent activity was driving, and they can drive. */
  prefersDriving: boolean;
};

/**
 * waiting   asked, not answered yet
 * confirmed more than an hour away
 * soon      the last hour before departure (I'm here)
 * late      departure passed, not started, less than 45 min (I'm in the car)
 * askRide   45 min to 3 h after departure, not started, not answered (Did you ride?)
 */
export type SeatPhase = 'waiting' | 'confirmed' | 'soon' | 'late' | 'askRide' | 'onTheRoad';
export type DrivePhase = 'ready' | 'overdue' | 'onTheRoad';

export type Hero =
  | { kind: 'seat'; phase: SeatPhase; seat: SeatHero }
  | { kind: 'drive'; phase: DrivePhase; drive: DriveHero }
  | { kind: 'request'; request: RequestHero; count: number }
  | { kind: 'cancelled'; cancelled: CancelledHero }
  | { kind: 'rate'; rate: RateHero }
  | { kind: 'idleDriver' }
  | { kind: 'idlePassenger' };

/** A seat counts as "leaving soon" this long before departure (matches the pickup window). */
export const SOON_MIN = 60;

const minutesSince = (iso: string, now: Date) => (now.getTime() - new Date(iso).getTime()) / 60_000;
const FINAL_ANSWERS: ReadonlySet<RiderAnswer> = new Set(['rode', 'driver_absent', 'didnt_go']);

/** Where a seat stands, or null when Home has nothing to show for it any more. */
export function seatPhase(seat: SeatHero, now: Date): SeatPhase | null {
  if (seat.startedAt) return 'onTheRoad';
  if (seat.status === 'requested') return 'waiting';
  const after = minutesSince(seat.departsAt, now);
  if (after < -SOON_MIN) return 'confirmed';
  if (after < 0) return 'soon';
  if (after >= SETTLE_AFTER_HOURS * 60) return null; // being settled
  if (seat.riderAnswer && FINAL_ANSWERS.has(seat.riderAnswer)) return null; // answered
  if (after < ASK_RIDE_AFTER_MIN || seat.boardedAt) return 'late';
  return 'askRide';
}

/** Where a drive stands, or null when Home has nothing to show for it any more. */
export function drivePhase(drive: DriveHero, now: Date): DrivePhase | null {
  if (drive.startedAt) return 'onTheRoad';
  const after = minutesSince(drive.departsAt, now);
  if (after < 0) return 'ready';
  if (drive.noGoReason || drive.riders === 0 || after >= SETTLE_AFTER_HOURS * 60) return null;
  return after >= OVERDUE_AFTER_MIN ? 'overdue' : 'ready';
}

/** The request to answer first: the soonest deadline, then whoever asked first. */
export function sortRequests(requests: RequestHero[], now: Date): RequestHero[] {
  return requests
    .filter((r) => new Date(r.respondBy).getTime() > now.getTime())
    .sort((a, b) => a.respondBy.localeCompare(b.respondBy) || a.createdAt.localeCompare(b.createdAt));
}

const byDeparture = <T extends { departsAt: string }>(a: T, b: T) => a.departsAt.localeCompare(b.departsAt);

export function pickHero(input: HomeInput, now: Date): Hero {
  const { cancelled, rate, dismissed } = input;
  const seats = input.seats
    .map((seat) => ({ seat, phase: seatPhase(seat, now) }))
    .filter((s): s is { seat: SeatHero; phase: SeatPhase } => s.phase !== null)
    .sort((a, b) => byDeparture(a.seat, b.seat));
  const drives = input.drives
    .map((drive) => ({ drive, phase: drivePhase(drive, now) }))
    .filter((d): d is { drive: DriveHero; phase: DrivePhase } => d.phase !== null)
    .sort((a, b) => byDeparture(a.drive, b.drive));
  const seatHero = (s: (typeof seats)[number]): Hero => ({ kind: 'seat', phase: s.phase, seat: s.seat });
  const driveHero = (d: (typeof drives)[number]): Hero => ({ kind: 'drive', phase: d.phase, drive: d.drive });

  // 1. On the road right now.
  const drivingNow = drives.find((d) => d.phase === 'onTheRoad');
  if (drivingNow) return driveHero(drivingNow);
  const ridingNow = seats.find((s) => s.phase === 'onTheRoad');
  if (ridingNow) return seatHero(ridingNow);

  // 2. Your drive is overdue.
  const overdue = drives.find((d) => d.phase === 'overdue');
  if (overdue) return driveHero(overdue);

  // 3. Pickup time, seat or drive, whichever leaves first.
  const pickupSeat = seats.find((s) => s.phase === 'soon' || s.phase === 'late');
  const pickupDrive = drives.find((d) => d.phase === 'ready' && minutesSince(d.drive.departsAt, now) >= -SOON_MIN);
  if (pickupSeat && pickupDrive) {
    return pickupDrive.drive.departsAt <= pickupSeat.seat.departsAt ? driveHero(pickupDrive) : seatHero(pickupSeat);
  }
  if (pickupDrive) return driveHero(pickupDrive);
  if (pickupSeat) return seatHero(pickupSeat);

  // 4. Did you ride?
  const ask = seats.find((s) => s.phase === 'askRide');
  if (ask) return seatHero(ask);

  // 5. A seat request to answer.
  const requests = sortRequests(input.requests, now);
  if (requests.length > 0) return { kind: 'request', request: requests[0], count: requests.length };

  // 6, 7. A cancelled seat, a trip to rate.
  if (cancelled && !dismissed.has(cancelled.bookingId)) return { kind: 'cancelled', cancelled };
  if (rate && !dismissed.has(rate.bookingId)) return { kind: 'rate', rate };

  // 8. Soonest commitment.
  const nextSeat = seats[0];
  const nextDrive = drives[0];
  if (nextSeat && nextDrive) return nextDrive.drive.departsAt < nextSeat.seat.departsAt ? driveHero(nextDrive) : seatHero(nextSeat);
  if (nextDrive) return driveHero(nextDrive);
  if (nextSeat) return seatHero(nextSeat);

  // 9. Nothing booked or posted.
  return input.prefersDriving ? { kind: 'idleDriver' } : { kind: 'idlePassenger' };
}

export type HeroLink =
  | { pathname: '/trips/[id]'; params: { id: string } }
  | { pathname: '/trips/requests/[id]'; params: { id: string } }
  | { pathname: '/trips/rate/[bookingId]'; params: { bookingId: string } }
  | null;

/** The screen a hero opens when tapped. Idle heroes have none: their buttons do the work. */
export function heroLink(hero: Hero): HeroLink {
  switch (hero.kind) {
    case 'seat':
      return { pathname: '/trips/[id]', params: { id: hero.seat.tripId } };
    case 'cancelled':
      // Trip details shows the "driver cancelled" screen with the other trips that day.
      return { pathname: '/trips/[id]', params: { id: hero.cancelled.tripId } };
    case 'drive':
      return { pathname: '/trips/requests/[id]', params: { id: hero.drive.tripId } };
    case 'request':
      return { pathname: '/trips/requests/[id]', params: { id: hero.request.tripId } };
    case 'rate':
      return { pathname: '/trips/rate/[bookingId]', params: { bookingId: hero.rate.bookingId } };
    default:
      return null;
  }
}

/** "07:00" from a departure, in local time, for "post your usual trip". */
export function usualTime(departsAt: string): string {
  const d = new Date(departsAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Post the usual trip today if its time is still ahead (with 30 minutes to spare), else tomorrow. */
export function usualDay(time: string, now: Date): 0 | 1 {
  const [h, m] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return at.getTime() - now.getTime() > 30 * 60_000 ? 0 : 1;
}
