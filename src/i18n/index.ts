import { getLocales } from 'expo-localization';

import { strings, type StringKey } from './strings';

export type Language = 'ar' | 'en';
export type Gender = 'm' | 'f';

// Arabic is the default; English only if the phone is set to English.
// Later the user picks this in their profile (profiles.language).
export function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'ar';
}

export function isRTL(lang: Language): boolean {
  return lang === 'ar';
}

/** Look up a string for a language and (for Arabic) the reader's gender. */
export function t(key: StringKey, lang: Language, gender: Gender = 'm'): string {
  const v = strings[key];
  if (lang === 'en') return v.en;
  if (gender === 'f' && 'ar_f' in v && v.ar_f) return v.ar_f;
  return v.ar_m;
}
