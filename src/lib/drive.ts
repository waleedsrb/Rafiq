// Drive mode: what the driver sees once the trip has started. Pure logic, so it is easy to test.
//
// - The next checkpoint: the first one in driving order that the car hasn't reached yet.
// - How far things are, said the way a driver reads them ("300 m", "4.2 km", "11 km").
// - About when you'll arrive: from straight-line distance, with a road factor and a
//   town-and-checkpoint average speed. It's a rough guide, so the app says "about".

import { distanceM } from './pickup.ts';
import type { LatLng } from './places.ts';

/** Roads wind: the drive is about this much longer than the straight line. */
export const ROAD_FACTOR = 1.35;
/** Average speed between West Bank cities, slow stretches and checkpoints included. */
export const AVG_KMH = 40;
/** A checkpoint counts as passed once the car is this much closer to the destination than it is. */
const PASSED_M = 150;
/** Within this of the destination, the screen says you're arriving. */
export const ARRIVING_M = 2000;

/**
 * The next checkpoint on the road, in driving order (first = nearest the start).
 * Without a position yet, it's the first one. Null once all are behind you.
 */
export function nextOnRoad<T extends LatLng>(road: T[], car: LatLng | null, dest: LatLng): { point: T; meters: number | null } | null {
  if (road.length === 0) return null;
  if (!car) return { point: road[0], meters: null };
  const carLeft = distanceM(car, dest);
  for (const p of road) {
    if (distanceM(p, dest) < carLeft + PASSED_M) return { point: p, meters: distanceM(car, p) };
  }
  return null;
}

/** Minutes of driving left, from where the car is to the destination. */
export function minutesLeft(car: LatLng, dest: LatLng): number {
  const km = (distanceM(car, dest) / 1000) * ROAD_FACTOR;
  return Math.max(1, Math.round((km / AVG_KMH) * 60));
}

/** About when you'll arrive: from the car's position, or (no position) from the start of the trip. */
export function arrivalAt(now: Date, car: LatLng | null, start: LatLng, dest: LatLng, startedAt: Date): Date {
  if (car) return new Date(now.getTime() + minutesLeft(car, dest) * 60_000);
  const whole = new Date(startedAt.getTime() + minutesLeft(start, dest) * 60_000);
  // Running late with no position: don't show a time in the past.
  return whole > now ? whole : new Date(now.getTime() + 5 * 60_000);
}

/** Are we nearly there? */
export function arriving(car: LatLng | null, dest: LatLng): boolean {
  return !!car && distanceM(car, dest) <= ARRIVING_M;
}

/** A distance the way a driver reads it: { n: '300', unit: 'm' } or { n: '4.2', unit: 'km' }. */
export function distanceParts(meters: number): { n: string; unit: 'm' | 'km' } {
  if (meters < 1000) return { n: String(Math.max(50, Math.round(meters / 50) * 50)), unit: 'm' };
  const km = meters / 1000;
  return { n: km < 10 ? km.toFixed(1).replace(/\.0$/, '') : String(Math.round(km)), unit: 'km' };
}
