import { getLocales } from 'expo-localization';

import { pickVariant } from './lookup';
import { strings, type StringKey, type Variants } from './strings';

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
  return pickVariant(strings[key] as Variants | undefined, key, lang, gender);
}
