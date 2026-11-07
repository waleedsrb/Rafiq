// Pure logic for repeating trips. Days use the database's numbering: 0 = Sunday ... 6 = Saturday.

import type { Language } from '@/i18n';

export const WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
/** The West Bank work week, and the default for a new repeating trip. */
export const WORK_WEEK = [0, 1, 2, 3, 4];

/** Tap a day on or off. Always keeps at least one day, and keeps them in week order. */
export function toggleDay(days: number[], day: number): number[] {
  if (days.includes(day)) return days.length > 1 ? days.filter((d) => d !== day) : days;
  return [...days, day].sort((a, b) => a - b);
}

// 1 Jan 2023 was a Sunday, so this date + n days is weekday n.
const SUNDAY = Date.UTC(2023, 0, 1);
const locale = (lang: Language) => (lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB');

/** "Sun" / "الأحد" */
export function weekdayName(day: number, lang: Language, width: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: width, timeZone: 'UTC' }).format(new Date(SUNDAY + day * 86_400_000));
}

/**
 * How to say a set of days: "every day", "Sunday to Thursday", or a list.
 * The screen picks the words for the first two, so they can follow the reader's language.
 */
export function describeDays(days: number[]): { kind: 'daily' } | { kind: 'workWeek' } | { kind: 'list'; days: number[] } {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return { kind: 'daily' };
  if (sorted.join() === WORK_WEEK.join()) return { kind: 'workWeek' };
  return { kind: 'list', days: sorted };
}

/** "07:30" from what the driver typed, for the database's time column. */
export function toDbTime(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
