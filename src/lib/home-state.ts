// What the top of Home shows. One rule for people who ride and drive:
//   1. A trip on the road right now (yours as driver or passenger).
//   2. Something that needs you: a seat request to answer, a driver who cancelled, a trip to rate.
//   3. Your soonest commitment: the seat you booked or the trip you drive, whichever leaves first.
//   4. Nothing booked or posted: the role you used last (drivers see demand, passengers the next seat).
// Each hero opens its own screen (heroLink), so Home never copies a page that already exists.

export type SeatHero = {
  bookingId: string;
  tripId: string;
  status: 'requested' | 'accepted';
  departsAt: string;
  startedAt: string | null;
};

export type DriveHero = {
  tripId: string;
  departsAt: string;
  startedAt: string | null;
  pending: number;
};

export type CancelledHero = { bookingId: string; tripId: string; departsAt: string };
export type RateHero = { bookingId: string; finishedAt: string };

export type HomeInput = {
  seat: SeatHero | null;
  /** Your soonest trip as a driver that hasn't finished. */
  drive: DriveHero | null;
  /** Your soonest trip as a driver that has a request waiting, if any (may differ from `drive`). */
  driveWithRequests: DriveHero | null;
  cancelled: CancelledHero | null;
  rate: RateHero | null;
  /** Hero cards the person closed with "Later" (booking ids). */
  dismissed: ReadonlySet<string>;
  /** True when the person's most recent activity was driving, and they can drive. */
  prefersDriving: boolean;
};

export type SeatPhase = 'waiting' | 'confirmed' | 'soon' | 'onTheRoad';
export type DrivePhase = 'requests' | 'ready' | 'onTheRoad';

export type Hero =
  | { kind: 'seat'; phase: SeatPhase; seat: SeatHero }
  | { kind: 'drive'; phase: DrivePhase; drive: DriveHero }
  | { kind: 'cancelled'; cancelled: CancelledHero }
  | { kind: 'rate'; rate: RateHero }
  | { kind: 'idleDriver' }
  | { kind: 'idlePassenger' };

/** A seat counts as "leaving soon" this long before departure (matches the pickup window). */
export const SOON_MIN = 60;

export function seatPhase(seat: SeatHero, now: Date): SeatPhase {
  if (seat.startedAt) return 'onTheRoad';
  if (seat.status === 'requested') return 'waiting';
  const minutes = (new Date(seat.departsAt).getTime() - now.getTime()) / 60_000;
  return minutes <= SOON_MIN ? 'soon' : 'confirmed';
}

export function drivePhase(drive: DriveHero): DrivePhase {
  if (drive.startedAt) return 'onTheRoad';
  return drive.pending > 0 ? 'requests' : 'ready';
}

export function pickHero(input: HomeInput, now: Date): Hero {
  const { seat, drive, driveWithRequests, cancelled, rate, dismissed } = input;

  // 1. On the road right now.
  if (drive?.startedAt) return { kind: 'drive', phase: 'onTheRoad', drive };
  if (seat?.startedAt) return { kind: 'seat', phase: 'onTheRoad', seat };

  // 2. Needs you now.
  if (driveWithRequests) return { kind: 'drive', phase: 'requests', drive: driveWithRequests };
  if (cancelled && !dismissed.has(cancelled.bookingId)) return { kind: 'cancelled', cancelled };
  if (rate && !dismissed.has(rate.bookingId)) return { kind: 'rate', rate };

  // 3. Soonest commitment.
  if (seat && drive) {
    return drive.departsAt < seat.departsAt
      ? { kind: 'drive', phase: drivePhase(drive), drive }
      : { kind: 'seat', phase: seatPhase(seat, now), seat };
  }
  if (drive) return { kind: 'drive', phase: drivePhase(drive), drive };
  if (seat) return { kind: 'seat', phase: seatPhase(seat, now), seat };

  // 4. Nothing booked or posted.
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
