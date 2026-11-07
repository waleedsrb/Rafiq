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

/** "Thursday 7 November" / "الخميس 7 نوفمبر" */
export function formatLongDay(d: Date, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

/** 12-hour clock for big times: 07:30 -> { time: "7:30", pm: false }; 13:05 -> { time: "1:05", pm: true }. */
export function clock(d: Date): { time: string; pm: boolean } {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return { time: `${h % 12 === 0 ? 12 : h % 12}:${m}`, pm: h >= 12 };
}

/** Part of the day a departure falls in, for the Where to / Results filter. */
export type DayPart = 'morning' | 'afternoon' | 'evening';
export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/** "1:42:10" or "12:05" for a countdown, from milliseconds left. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Short day for chips: "Sun 10" / "الأحد 10". */
export function formatChipDay(d: Date, lang: Language): string {
  return new Intl.DateTimeFormat(locale(lang), { weekday: 'short', day: 'numeric' }).format(d).replace('،', '');
}

/** List times: 24-hour without a leading zero ("7:30", "18:00"), so evening trips can't be misread. */
export function shortTime(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
