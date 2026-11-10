// Checkpoints on the way (whole West Bank maps, step 3). Pure logic, so it is easy to test.
//
// The app has no road routing yet (v1 shows pins, not a route), so "on the way" means near
// the straight line from the pickup to the destination:
// - suggested: within SUGGEST_KM of the line and between its ends. Ticked when posting.
// - nearby: a little further out (NEARBY_KM). Shown unticked, for winding roads.
// The driver confirms the list; the trip stores the ids (trips.checkpoint_ids).
// Everything is shown in driving order: how far along the line each one sits.

import type { LatLng } from './places.ts';

export const SUGGEST_KM = 3;
export const NEARBY_KM = 8;

type Point = LatLng & { id: string };

/** Where p sits relative to the line a -> b: `along` 0 at a, 1 at b; `offKm` sideways. */
export function onLine(a: LatLng, b: LatLng, p: LatLng): { along: number; offKm: number } {
  // Flat earth in km is plenty at West Bank scale (1° lat ≈ 111 km, 1° lng ≈ 94.5 km).
  const x = (q: LatLng) => (q.longitude - a.longitude) * 94.5;
  const y = (q: LatLng) => (q.latitude - a.latitude) * 111;
  const bx = x(b);
  const by = y(b);
  const px = x(p);
  const py = y(p);
  const len2 = bx * bx + by * by;
  if (len2 === 0) return { along: 0, offKm: Math.hypot(px, py) };
  const along = (px * bx + py * by) / len2;
  const t = Math.min(1, Math.max(0, along));
  return { along, offKm: Math.hypot(px - t * bx, py - t * by) };
}

/** The points in driving order, from a towards b. */
export function inDrivingOrder<T extends LatLng>(a: LatLng, b: LatLng, points: T[]): T[] {
  return points
    .map((p) => ({ p, along: onLine(a, b, p).along }))
    .sort((m, n) => m.along - n.along)
    .map((m) => m.p);
}

/** Checkpoints to offer when posting: `suggested` (ticked) and `nearby` (not ticked), in driving order. */
export function checkpointsNear<T extends Point>(a: LatLng, b: LatLng, all: T[]): { suggested: T[]; nearby: T[] } {
  const suggested: T[] = [];
  const nearby: T[] = [];
  for (const p of inDrivingOrder(a, b, all)) {
    const { along, offKm } = onLine(a, b, p);
    // Not behind the start or past the end (a little slack for checkpoints at a town's edge).
    if (along < -0.03 || along > 1.03) continue;
    if (offKm <= SUGGEST_KM) suggested.push(p);
    else if (offKm <= NEARBY_KM) nearby.push(p);
  }
  return { suggested, nearby };
}

/**
 * The trip's checkpoints in driving order. A trip that lists them (posted since Nov 10) shows
 * exactly those. An older trip on the Ramallah - Nablus road shows the four hand-placed ones
 * (`legacy`); any other older trip shows none rather than guess.
 */
export function tripCheckpoints<T extends Point>(a: LatLng, b: LatLng, ids: string[] | null | undefined, all: T[], legacy: T[]): T[] {
  if (ids && ids.length) {
    const chosen = new Set(ids);
    return inDrivingOrder(a, b, all.filter((p) => chosen.has(p.id)));
  }
  return inDrivingOrder(a, b, legacy);
}
