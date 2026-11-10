import type { Variants } from './strings.ts';

/**
 * Pick the right variant of one string. `v` is undefined when the key isn't in strings.ts,
 * which happens when a key is built at runtime (a place id, a status from the server). We show
 * the key itself instead of crashing the whole screen, so a missing translation is visible but harmless.
 */
export function pickVariant(v: Variants | undefined, key: string, lang: 'ar' | 'en', gender: 'm' | 'f' = 'm'): string {
  if (!v) return key;
  if (lang === 'en') return v.en;
  if (gender === 'f' && v.ar_f) return v.ar_f;
  return v.ar_m;
}
