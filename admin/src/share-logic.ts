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
};

export type ShareStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export function tripStatus(t: Pick<SharedTrip, 'started_at' | 'finished_at' | 'cancelled_at'>): ShareStatus {
  if (t.cancelled_at) return 'cancelled';
  if (t.finished_at) return 'finished';
  if (t.started_at) return 'live';
  return 'scheduled';
}

const CITIES: Record<string, { ar: string; en: string }> = {
  ramallah: { ar: 'رام الله', en: 'Ramallah' },
  nablus: { ar: 'نابلس', en: 'Nablus' },
};

export function cityName(city: string, lang: Lang): string {
  return CITIES[city]?.[lang] ?? city;
}

/** Whole minutes between a time and now, never negative. */
export function minutesAgo(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
}
