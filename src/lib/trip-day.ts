// Trip day rules (slice 8). The database enforces the same numbers in
// supabase/migrations/20261108000000_trip_day.sql; this copy lets the app
// show the right button at the right time. Change both together.

const MIN = 60 * 1000;

/** The driver can tick who got in from an hour before departure. */
export const PICKUP_OPENS_MIN = 60;
/** "I'm here" and Start trip open 30 minutes before departure. */
export const START_OPENS_MIN = 30;
/** A passenger can be marked as a no-show from 10 minutes after departure. */
export const NO_SHOW_AFTER_MIN = 10;
/** Trips nobody finishes are finished automatically this long after Start. */
export const AUTO_FINISH_HOURS = 4;
/**
 * Trips nobody started (supabase/migrations/20261111150000_unstarted_trips.sql):
 * the driver's card turns "overdue" (and gets a push) 15 min after departure, riders are
 * asked "Did you ride?" at 45 min, and the trip is settled 3 hours after departure.
 */
export const OVERDUE_AFTER_MIN = 15;
export const ASK_RIDE_AFTER_MIN = 45;
export const SETTLE_AFTER_HOURS = 3;
/** Ratings stay open this many days after the trip. */
export const RATING_DAYS = 7;

export type TripState = 'scheduled' | 'underway' | 'finished' | 'cancelled';

type TripTimes = { cancelled_at: string | null; started_at: string | null; finished_at: string | null };

/** Where a trip stands, from its timestamps. */
export function tripState(trip: TripTimes): TripState {
  if (trip.cancelled_at) return 'cancelled';
  if (trip.finished_at) return 'finished';
  if (trip.started_at) return 'underway';
  return 'scheduled';
}

const minutesTo = (now: Date, departsAt: Date) => (departsAt.getTime() - now.getTime()) / MIN;

/** Has the pickup window (driver's tick list) opened? */
export function pickupOpen(now: Date, departsAt: Date): boolean {
  return minutesTo(now, departsAt) <= PICKUP_OPENS_MIN;
}

/** Can the passenger say "I'm here", or the driver tap Start trip? */
export function startOpen(now: Date, departsAt: Date): boolean {
  return minutesTo(now, departsAt) <= START_OPENS_MIN;
}

/** Can the driver mark someone who hasn't come as a no-show? */
export function noShowOpen(now: Date, departsAt: Date): boolean {
  return minutesTo(now, departsAt) <= -NO_SHOW_AFTER_MIN;
}

/** When the no-show button appears. */
export function noShowFrom(departsAt: Date): Date {
  return new Date(departsAt.getTime() + NO_SHOW_AFTER_MIN * MIN);
}

/** Can this trip still be rated? */
export function ratingOpen(now: Date, finishedAt: Date): boolean {
  return now.getTime() <= finishedAt.getTime() + RATING_DAYS * 24 * 60 * MIN;
}
