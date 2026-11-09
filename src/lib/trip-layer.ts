// Opening a trip without leaving the page you're on.
//
// Trip details is a layer over the current page (a glass card over a map), so it can grow
// out of whatever you tapped. openTrip() asks for it; the host in the root layout draws it
// (src/components/trip-layer-host.tsx). The search draws its own, inside its layer, so a
// tap on a result grows right out of that row (see TripOpenerContext).

import { createContext, useContext } from 'react';

/** Where something sits on screen, in window points (measureInWindow). */
export type Rect = { x: number; y: number; width: number; height: number };

export type TripRequest = { id: string; from: Rect | null; key: number };

let current: TripRequest | null = null;
let nextKey = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Open a trip over the page you're on. `from` is what you tapped, so the card grows out of it. */
export function openTrip(id: string, from?: Rect | null) {
  current = { id, from: from ?? null, key: nextKey++ };
  emit();
}

/** For the host: forget the open trip once its card has folded away. */
export function clearTrip() {
  current = null;
  emit();
}

export function subscribeTrip(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentTrip(): TripRequest | null {
  return current;
}

/**
 * Who opens a trip from here. Inside the search, results open in the search's own layer;
 * everywhere else, the root host. Components call useOpenTrip() and don't need to know.
 */
export const TripOpenerContext = createContext<(id: string, from?: Rect | null) => void>(openTrip);

export function useOpenTrip() {
  return useContext(TripOpenerContext);
}

/** Measure a pressable (or any view) and open the trip from it. */
export function openTripFrom(
  view: { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void } | null,
  id: string,
  open: (id: string, from?: Rect | null) => void,
) {
  if (!view) return open(id, null);
  view.measureInWindow((x, y, width, height) => open(id, width > 0 ? { x, y, width, height } : null));
}
