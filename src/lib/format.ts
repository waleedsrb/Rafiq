import type { Language } from '@/i18n';

// Dates in the person's language, but always with Western digits (design rule).
const locale = (lang: Language) => (lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB');

/** "Sat 8 Nov" / "السبت 8 نوفمبر" */
export function formatDay(d: Date, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

/** "07:30" */
export function formatTime(d: Date, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
