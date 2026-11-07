// A person's numbers for Your profile, from person_stats() (trip day, slice 8-9). Named apart from
// lib/stats.ts on the trip day branch so the two PRs merge cleanly; fold together after both land.

export type PersonStats = {
  completed_trips: number;
  rating_avg: number | string | null;
  rating_count: number;
  reliability: number | string | null; // share of accepted seats not cancelled late, 0 to 1
  founding_driver: boolean;
};

/** "12", "100%", "4.9". A dash until there is something to show. */
export function formatStats(s: PersonStats): { trips: string; reliability: string; rating: string } {
  const rel = s.reliability === null ? null : Number(s.reliability);
  const avg = s.rating_avg === null ? null : Number(s.rating_avg);
  return {
    trips: String(s.completed_trips ?? 0),
    // Accept 0-1 or 0-100, whichever the database sends.
    reliability: rel === null || Number.isNaN(rel) ? '–' : `${Math.round(rel <= 1 ? rel * 100 : rel)}%`,
    rating: avg === null || Number.isNaN(avg) || !s.rating_count ? '–' : avg.toFixed(1),
  };
}
