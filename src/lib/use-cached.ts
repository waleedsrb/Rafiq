// The React side of src/lib/cache.ts: a page reads what the cache already has (so it
// draws at once), and asks the server again each time it comes into view.

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { cache, type Query } from '@/lib/cache';

/** What the cache holds for a query, kept up to date, plus ways to refresh or change it. */
function useCacheEntry<T>(query: Query<T> | null) {
  const key = query?.key ?? '';
  const subscribe = useCallback((l: () => void) => (key ? cache.subscribe(key, l) : () => {}), [key]);
  const read = useCallback(() => (key ? cache.get<T>(key) : undefined), [key]);
  const data = useSyncExternalStore(subscribe, read, read);
  const failed = useSyncExternalStore(subscribe, () => (key ? cache.failed(key) : false), () => false);

  // `query` is a new object each render; its key says whether it's really another query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => (query ? cache.load(query) : Promise.resolve(undefined)), [key]);
  /** Change what every page shows right away (e.g. a switch flipped, a form saved). */
  const set = useCallback((value: T | ((old: T | undefined) => T)) => key && cache.set<T>(key, value), [key]);
  return { key, data, failed, refresh, set };
}

/**
 * For a page: `data` is undefined only the very first time nothing has loaded yet (that's
 * when it shows its skeleton). After that it always has the last answer, even mid-refresh.
 * Asks the server again each time the page comes into view.
 *
 * `fresh`: skip asking again if an answer landed this recently (ms). The default lets a
 * page opened right after a prefetch use it without a second request.
 */
export function useCached<T>(query: Query<T> | null, { fresh = 2_000 }: { fresh?: number } = {}) {
  const { key, ...entry } = useCacheEntry(query);
  useFocusEffect(
    useCallback(() => {
      if (query) void cache.load(query, fresh);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, fresh]),
  );
  return entry;
}

/** The same for a block that isn't a page of its own (the trip card is drawn over pages,
 *  outside navigation): asks once when it appears, and again if the query changes. */
export function useCachedHere<T>(query: Query<T> | null, { fresh = 2_000 }: { fresh?: number } = {}) {
  const { key, ...entry } = useCacheEntry(query);
  useEffect(() => {
    if (query) void cache.load(query, fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fresh]);
  return entry;
}
