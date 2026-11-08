// Pure logic for ride alerts: which time window "Alert me" saves.

import type { DayPart } from './format.ts';

// Same boundaries as dayPart() in format.ts: morning until 12:00, afternoon until 17:00.
const PART_HOURS: Record<DayPart, [number, number]> = { morning: [0, 12], afternoon: [12, 17], evening: [17, 24] };

/**
 * The window a search covered: the whole day (local midnight to midnight), or one part of it.
 * Returns null when the window is already over, so there is nothing to wait for.
 */
export function alertWindow(dayStart: Date, part: DayPart | null, now: Date): { from: Date; to: Date } | null {
  const [h0, h1] = part ? PART_HOURS[part] : [0, 24];
  const from = new Date(dayStart);
  from.setHours(h0, 0, 0, 0);
  const to = new Date(dayStart);
  to.setHours(0, 0, 0, 0);
  to.setHours(h1, 0, 0, 0);
  if (to.getTime() <= now.getTime()) return null;
  return { from, to };
}
