// Home's "Where to?" search, as a layer that is always ready (Nov 12 rebuild, option A).
//
// The search is built once, a moment after you sign in, and sleeps out of sight above every
// screen (src/components/search-layer.tsx, mounted in the root layout). Tapping Home's bar
// only wakes it: nothing is created on the tap, which is what made the first frames stutter
// when the search was a popup built on demand.
//
// Home talks to it through this small store, so the search's own state (route, day, trips)
// never re-renders Home, and Home's state never re-renders the search.

import { makeMutable } from 'react-native-reanimated';

import type { City } from '@/lib/trip-form';
import type { Rect } from '@/lib/trip-layer';

export type SearchRequest = {
  /** Where Home's bar is on screen, so the search starts exactly on it. */
  from: Rect;
  /** Changes on every open. */
  key: number;
  /** True once × or a swipe asked it to fold back into Home's bar. */
  closing: boolean;
};

let current: SearchRequest | null = null;
let usual: { origin: City; destination: City } | null = null;
let nextKey = 1;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/**
 * 1 while the search layer covers Home's bar (from the tap until it has folded back).
 * A shared value, not React state: Home's bar hides and shows on the UI thread in the same
 * frame the layer appears or goes, without re-rendering Home.
 */
export const searchCoversBar = makeMutable(0);

export function openSearch(from: Rect) {
  if (current && !current.closing) return;
  current = { from, key: nextKey++, closing: false };
  emit();
}

export function closeSearch() {
  if (!current || current.closing) return;
  current = { ...current, closing: true };
  emit();
}

/** For the layer: it has folded back into Home's bar. */
export function searchClosed() {
  current = null;
  emit();
}

/** Home's usual route: the search starts on it until you change it. */
export function setUsualRoute(origin: City, destination: City) {
  if (usual?.origin === origin && usual?.destination === destination) return;
  usual = { origin, destination };
  emit();
}

export function usualRoute() {
  return usual;
}

export function currentSearch(): SearchRequest | null {
  return current;
}

export function subscribeSearch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
