// Trust stats (slice 9). The numbers come from people_stats() in the database;
// this file only decides how to say them.

export type Stats = {
  completed_trips: number;
  rating_avg: number | string | null; // Postgres numeric arrives as a string
  rating_count: number;
  reliability: number | string | null; // 0..1
  founding_driver: boolean;
};

/** "4.8", or null before the first rating. */
export function ratingText(s: Stats): string | null {
  if (s.rating_count < 1 || s.rating_avg === null) return null;
  return Number(s.rating_avg).toFixed(1);
}

/** "96%", or null with no history yet. */
export function reliabilityText(s: Stats): string | null {
  if (s.reliability === null) return null;
  return `${Math.round(Number(s.reliability) * 100)}%`;
}

/** Someone with no finished trips and no ratings is "new", not "0 trips, 0%". */
export function isNew(s: Stats): boolean {
  return s.completed_trips === 0 && s.rating_count === 0 && s.reliability === null;
}

/** Arabic counts 3 to 10 take the plural (5 رحلات); other numbers the singular (12 رحلة, 1 رحلة). */
export function tripsKey(n: number): 'tripsWord' | 'tripsWordFew' {
  return n >= 3 && n <= 10 ? 'tripsWordFew' : 'tripsWord';
}
