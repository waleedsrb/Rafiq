// A small memory of what each page last loaded, so opening it again (or opening it for
// the first time after another page fetched the same thing) shows the answer at once.
//
// The pattern is called "stale-while-revalidate": show what you already have straight
// away, quietly ask the server again, and swap in the new answer when it lands. The
// person never waits on a blank page for data the app already had a moment ago.
//
// Pure TypeScript, no React, so the tests can import it (the hook is in use-cached.ts).

export type Query<T> = {
  /** Names the data. Include everything it depends on, e.g. `car:<user id>`. */
  key: string;
  /** Loads it. Throw on failure, so a bad answer never replaces a good one. */
  fetch: () => Promise<T>;
};

type Entry = {
  data?: unknown;
  has: boolean;
  /** When the last answer landed (ms). */
  at: number;
  /** The request still on its way, so two pages asking at once share it. */
  inflight?: Promise<unknown>;
  failed: boolean;
  /** Counts requests, so an older answer landing late never replaces a newer one. */
  seq: number;
};

export function createCache(now: () => number = Date.now) {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();

  const entry = (key: string): Entry => {
    let e = entries.get(key);
    if (!e) {
      e = { has: false, at: 0, failed: false, seq: 0 };
      entries.set(key, e);
    }
    return e;
  };
  const emit = (key: string) => listeners.get(key)?.forEach((l) => l());

  /**
   * Ask the server now, even if a request is already on its way (something just changed,
   * e.g. a live update said the driver accepted). Never throws.
   */
  function refetch<T>(query: Query<T>): Promise<T | undefined> {
    const e = entry(query.key);
    const seq = ++e.seq;
    // A newer request, or a value set by hand (a save), wins over this one.
    const latest = () => seq === e.seq;
    const p: Promise<T | undefined> = query
      .fetch()
      .then((data) => {
        if (!latest()) return e.data as T;
        e.data = data;
        e.has = true;
        e.at = now();
        e.failed = false;
        return data;
      })
      .catch(() => {
        if (latest()) e.failed = true;
        return e.data as T | undefined;
      })
      .finally(() => {
        if (e.inflight === p) e.inflight = undefined;
        if (latest()) emit(query.key);
      });
    e.inflight = p;
    return p;
  }

  return {
    /** What we have for this key, or undefined before the first answer. */
    get<T>(key: string): T | undefined {
      return entries.get(key)?.data as T | undefined;
    },
    has(key: string): boolean {
      return entries.get(key)?.has ?? false;
    },
    /** True when the last try failed (the old answer, if any, is kept). */
    failed(key: string): boolean {
      return entries.get(key)?.failed ?? false;
    },

    /** Put an answer in by hand, e.g. right after saving, so every page shows it at once. */
    set<T>(key: string, value: T | ((old: T | undefined) => T)) {
      const e = entry(key);
      e.seq++; // an answer already on its way is older than this
      e.data = typeof value === 'function' ? (value as (old: T | undefined) => T)(e.data as T | undefined) : value;
      e.has = true;
      e.at = now();
      e.failed = false;
      emit(key);
    },

    /**
     * Ask the server, unless an answer landed less than `fresh` ms ago (so a page opened
     * right after another fetched the same thing doesn't ask twice). Requests already on
     * their way are shared. Never throws: a failure keeps the old answer.
     */
    load<T>(query: Query<T>, fresh = 0): Promise<T | undefined> {
      const e = entry(query.key);
      if (e.inflight) return e.inflight as Promise<T | undefined>;
      if (e.has && !e.failed && now() - e.at < fresh) return Promise.resolve(e.data as T);
      return refetch(query);
    },

    refetch,

    subscribe(key: string, listener: () => void) {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },

    /** Forget everything (signing out, or another person signing in). */
    clear() {
      const keys = [...entries.keys()];
      entries.clear();
      keys.forEach(emit);
    },
  };
}

export type Cache = ReturnType<typeof createCache>;

/** The app's one cache. */
export const cache = createCache();

/** Start loading something a page is about to need, without waiting for it. */
export function prefetch<T>(query: Query<T> | null, fresh = 5_000) {
  if (query) void cache.load(query, fresh);
}
