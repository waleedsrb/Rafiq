// Pure helpers for the Share my trip page (kept apart so they can be tested without a browser).

export type Lang = 'ar' | 'en';

export type SharedTrip = {
  origin: string;
  destination: string;
  departs_at: string;
  started_at: string | null;
  finished_at: string | null;
  cancelled_at: string | null;
  sharer_name: string;
  driver_name: string;
  car_model: string | null;
  car_color: string | null;
  plate: string | null;
  lat: number | string | null;
  lng: number | string | null;
  position_at: string | null;
  /** Place names from shared_trip() (any West Bank town now, so the page can't keep its own list). */
  origin_ar?: string | null;
  origin_en?: string | null;
  destination_ar?: string | null;
  destination_en?: string | null;
};

export type ShareStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export function tripStatus(t: Pick<SharedTrip, 'started_at' | 'finished_at' | 'cancelled_at'>): ShareStatus {
  if (t.cancelled_at) return 'cancelled';
  if (t.finished_at) return 'finished';
  if (t.started_at) return 'live';
  return 'scheduled';
}

// Before trips could go between any two towns, the server sent just 'ramallah' or 'nablus'.
const OLD: Record<string, { ar: string; en: string }> = {
  ramallah: { ar: 'رام الله', en: 'Ramallah' },
  nablus: { ar: 'نابلس', en: 'Nablus' },
};

/** One end of the trip by name: what the server named it, else the old two-city list. */
export function placeName(trip: SharedTrip, end: 'origin' | 'destination', lang: Lang): string {
  const named = trip[`${end}_${lang}`];
  if (named) return named;
  const id = trip[end];
  return OLD[id]?.[lang] ?? id;
}

/** Whole minutes between a time and now, never negative. */
export function minutesAgo(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
}
