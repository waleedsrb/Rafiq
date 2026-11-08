// Small pure helpers for signing in (no app imports, so `npm test` can run them).

/**
 * One standard form for an email address, so "Name@Gmail.com " and
 * "name@gmail.com" are the same account. Returns null when it can't be an address.
 * The check is deliberately loose: the code we email is the real test.
 */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** The one-time code from the URL Supabase sends back, or null if it sent an error. */
export function oauthCode(url: string): string | null {
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const params = new URLSearchParams(query);
  if (params.get('error')) return null;
  return params.get('code');
}

/** Names the sign-in provider gave us (Google always, Apple only the first time). */
export function providerNames(meta: Record<string, unknown> | undefined): { first: string; last: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const first = text(meta?.given_name);
  const last = text(meta?.family_name);
  if (first || last) return { first, last };
  // Some Google accounts only have one full name.
  const [head = '', ...rest] = text(meta?.full_name ?? meta?.name).split(/\s+/);
  return { first: head, last: rest.join(' ') };
}
