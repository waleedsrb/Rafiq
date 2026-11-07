// Every user-facing string lives here, in three variants:
//   ar_m = Arabic addressing a man, ar_f = Arabic addressing a woman, en = English.
// Arabic grammar changes with the gender of the person you talk to
// ("are you ready?" is جاهز؟ to a man and جاهزة؟ to a woman), so we key on it from day one.
// If a string is the same for both genders, ar_f can be left out and ar_m is used.

export type Variants = { ar_m: string; ar_f?: string; en: string };

export const strings = {
  appName: { ar_m: 'رفيق', en: 'Rafiq' },
  tagline: {
    ar_m: 'مشوارك بين المدن، مضمون',
    en: 'Your ride between cities, guaranteed',
  },
  getStarted: { ar_m: 'ابدأ', ar_f: 'ابدئي', en: 'Get started' },
  comingSoon: {
    ar_m: 'رام الله ↔ نابلس قريباً',
    en: 'Ramallah ↔ Nablus, coming soon',
  },
} satisfies Record<string, Variants>;

export type StringKey = keyof typeof strings;
