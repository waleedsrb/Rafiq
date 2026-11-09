// Pickup points: where a driver meets riders. Pure logic, so it is easy to test.
//
// A pickup is a pin (lat, lng) plus a short label riders read ("Al-Manara Square, by the
// bakery"). The "Where do you meet riders?" step offers spots (your usual one, ones other
// drivers use, the city centre); moving the map anywhere else makes a spot of your own.

import type { LatLng } from './places.ts';

export type Pickup = LatLng & { label: string };
export type SpotKind = 'usual' | 'popular' | 'centre';
export type Spot = Pickup & { kind: SpotKind };

export const LABEL_MIN = 2;
export const LABEL_MAX = 80;
/** Two pins closer than this are the same spot (a map nudge shouldn't lose its name). */
export const SAME_SPOT_M = 40;

/** Metres between two points (haversine; plenty for city distances). */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The spot a pin sits on, if any (the nearest one within SAME_SPOT_M). */
export function spotAt(spots: Spot[], at: LatLng): Spot | null {
  let best: Spot | null = null;
  let bestD = SAME_SPOT_M;
  for (const s of spots) {
    const d = distanceM(s, at);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** The pin moved: snap to a spot it landed on, else keep your own label for the new place. */
export function movePickup(prev: Pickup, at: LatLng, spots: Spot[]): Pickup {
  const spot = spotAt(spots, at);
  if (spot) return { label: spot.label, latitude: spot.latitude, longitude: spot.longitude };
  // Leaving a named spot: its name no longer fits, so the driver writes one.
  const wasSpot = spots.some((s) => s.label === prev.label);
  return { label: wasSpot ? '' : prev.label, latitude: at.latitude, longitude: at.longitude };
}

export function labelOk(label: string): boolean {
  const n = label.trim().length;
  return n >= LABEL_MIN && n <= LABEL_MAX;
}

/**
 * The spots to offer, without duplicates: your usual one first, then popular ones, then the
 * city centre. Two spots on (almost) the same place keep the first one.
 */
export function offerSpots(usual: Pickup | null, popular: Pickup[], centre: Pickup, max = 3): Spot[] {
  const out: Spot[] = [];
  const add = (p: Pickup | null, kind: SpotKind) => {
    if (!p || !labelOk(p.label) || out.length >= max) return;
    if (out.some((s) => distanceM(s, p) <= SAME_SPOT_M)) return;
    out.push({ ...p, label: p.label.trim(), kind });
  };
  add(usual, 'usual');
  for (const p of popular) add(p, 'popular');
  add(centre, 'centre');
  return out;
}
