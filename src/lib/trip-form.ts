// Pure logic for the "post a trip" form. No React, no database, so it is easy to test.

import { toWesternDigits } from './digits.ts';

export const CITIES = ['ramallah', 'nablus'] as const;
export type City = (typeof CITIES)[number];

export const SEATS_MIN = 1;
export const SEATS_MAX = 6;
export const PRICE_MAX = 200; // ILS; anything above is almost certainly a typo

/** Parse "7:30" or "07:30" (24-hour) into hours and minutes, or null. */
export function parseTime(input: string): { h: number; m: number } | null {
  const match = toWesternDigits(input).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * The departure moment: `dayOffset` days after `now` (0 = today), at the given time,
 * in the phone's local time zone. Returns null if the time is invalid or already past.
 */
export function departureFrom(dayOffset: number, time: string, now: Date): Date | null {
  const t = parseTime(time);
  if (!t) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(t.h, t.m, 0, 0);
  return d.getTime() > now.getTime() ? d : null;
}

/** Parse a price like "25" or "22.5". Western or Arabic-Indic digits. */
export function parsePrice(input: string): number | null {
  const western = toWesternDigits(input).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(western)) return null;
  const n = Number(western);
  return n > 0 && n <= PRICE_MAX ? n : null;
}

export function clampSeats(n: number): number {
  return Math.min(SEATS_MAX, Math.max(SEATS_MIN, n));
}
