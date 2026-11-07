// Booking time rules (decided in product topic 3). The database enforces the
// same rules in guard_booking(); this copy lets the app explain them up front.
// If you change a number here, change it in the latest migration too.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * How long the driver has to answer a request, from when it is made:
 * more than 24h before departure: 6h; 6 to 24h: 2h; under 6h: 30 min.
 * Never later than departure itself.
 */
export function respondBy(requestedAt: Date, departsAt: Date): Date {
  const lead = departsAt.getTime() - requestedAt.getTime();
  const window = lead > 24 * HOUR ? 6 * HOUR : lead > 6 * HOUR ? 2 * HOUR : 30 * MIN;
  return new Date(Math.min(requestedAt.getTime() + window, departsAt.getTime()));
}

/**
 * Can a passenger cancel an accepted seat for free right now?
 * Yes until 12h before departure. If the driver accepted inside that 12h
 * (a late booking), there are 15 free minutes after acceptance.
 */
export function freeCancel(now: Date, departsAt: Date, acceptedAt: Date | null): boolean {
  if (now.getTime() <= departsAt.getTime() - 12 * HOUR) return true;
  return acceptedAt !== null && now.getTime() <= acceptedAt.getTime() + 15 * MIN;
}
