// Pure logic for searching seats: which day a chip means and which trips a filter keeps.
// Shared by the search sheet on Home and the stand-alone results screen.

import { dayPart, type DayPart } from './format.ts';

export const PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];

/** How many day pills sit in a row (today plus six). Later days come from the calendar. */
export const PILL_DAYS = 7;
/** The furthest day anyone can post or search: today + 30 (Waleed, Nov 11). */
export const AHEAD_DAYS = 30;

/** Local midnight at the start of the day `day` days after `now`. */
export function searchDayStart(day: number, now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Turn a route param into a part of the day, or null for the whole day. */
export function parsePart(v: string | undefined | null): DayPart | null {
  return v && (PARTS as string[]).includes(v) ? (v as DayPart) : null;
}

/** Keep the trips in the chosen part of the day (all of them when none is chosen), and
 *  only women-only trips when that filter is on. Order is kept (earliest first). */
export function filterTrips<T extends { departs_at: string; women_only: boolean }>(
  trips: T[],
  part: DayPart | null,
  womenOnly: boolean,
): T[] {
  return trips.filter((r) => (!part || dayPart(new Date(r.departs_at)) === part) && (!womenOnly || r.women_only));
}

/** Which day (0 = today) a departure falls on, or -1 when it is before today or past AHEAD_DAYS. */
export function dayIndex(departsAt: string, now: Date): number {
  const start = searchDayStart(0, now).getTime();
  const d = new Date(departsAt);
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Round, so a day that is 23 or 25 hours long (clock change) still counts as one.
  const i = Math.round((local - start) / 86_400_000);
  return i >= 0 && i <= AHEAD_DAYS ? i : -1;
}

/** How many trips each day has (index 0 = today .. AHEAD_DAYS), from one search over the whole range. */
export function countByDay(trips: { departs_at: string }[], now: Date): number[] {
  const counts = Array.from({ length: AHEAD_DAYS + 1 }, () => 0);
  for (const t of trips) {
    const i = dayIndex(t.departs_at, now);
    if (i >= 0) counts[i]++;
  }
  return counts;
}

/** Leaving within the hour (and not gone yet): worth a small "leaving soon" note. */
export function leavingSoon(departsAt: string, now: Date): boolean {
  const ms = new Date(departsAt).getTime() - now.getTime();
  return ms > 0 && ms <= 60 * 60 * 1000;
}
