// Checkpoint status helpers (slice 7). The status itself is decided in the database
// (checkpoint_overview); this file only has the small pure pieces the screens share.

export type CheckpointStatus = 'open' | 'crowded' | 'closed';
export const STATUSES: CheckpointStatus[] = ['open', 'crowded', 'closed'];

/** Whole minutes between two moments, never negative. */
export function minutesAgo(then: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60000));
}

// ─── Hold to report (slice 15c) ──────────────────────────────────────────────
// A report is sent only after the button is held for HOLD_MS, so a stray tap sends
// nothing. While holding, a hum speeds up like a motor, then a confirming buzz when the
// circle completes.

export const HOLD_MS = 1000;

/** Let go before this and we show "keep holding"; shorter is just a tap. */
export const TOO_SHORT_MS = 400;

// The hum while holding: like a motor speeding up. Pulses start HUM_SLOW_MS apart and
// close in to HUM_FAST_MS, so by the end they blur into one buzz.
export const HUM_SLOW_MS = 45;
export const HUM_FAST_MS = 12;

/** Time to the next pulse, from how long the button has been held. */
export function humGap(elapsedMs: number): number {
  const share = Math.min(1, Math.max(0, elapsedMs / HOLD_MS));
  const eased = share * share * (3 - 2 * share); // smooth start and end
  return Math.round(HUM_SLOW_MS - (HUM_SLOW_MS - HUM_FAST_MS) * eased);
}

/** Android vibrates from a pattern instead: [wait, buzz, wait, buzz, ...] in ms, the
 *  waits shrinking to nothing, so it ends as one continuous buzz. */
export function humPattern(): number[] {
  const pattern = [0];
  let at = 0;
  while (at < HOLD_MS) {
    const buzz = 18;
    const wait = Math.max(0, humGap(at) - buzz);
    pattern.push(buzz, wait);
    at += buzz + wait;
  }
  return pattern;
}

/** What to say under the status: confirmed, not yet, or nothing when there is no status. */
export function confidence(row: { status: CheckpointStatus | null; confirmed?: boolean | null }): 'confirmed' | 'unconfirmed' | null {
  if (!row.status) return null;
  return row.confirmed ? 'confirmed' : 'unconfirmed';
}

/** The word after a report count: "1 report", "3 reports"; Arabic 1 بلاغ, 3–10 بلاغات, 11+ بلاغًا. */
export function reportsKey(n: number): 'reportsWordOne' | 'reportsWord' | 'reportsWordMany' {
  if (n === 1) return 'reportsWordOne';
  return n > 10 ? 'reportsWordMany' : 'reportsWord';
}

// ─── The whole West Bank (maps step 4) ───────────────────────────────────────
// Checkpoints carry their governorate in English, as OpenStreetMap names it
// ("Nablus Governorate"). The tab groups them north to south.

const GOVERNORATES: { en: string; ar: string; match: string }[] = [
  { match: 'Jenin', en: 'Jenin', ar: 'جنين' },
  { match: 'Tubas', en: 'Tubas', ar: 'طوباس' },
  { match: 'Tulkarm', en: 'Tulkarm', ar: 'طولكرم' },
  { match: 'Nablus', en: 'Nablus', ar: 'نابلس' },
  { match: 'Qalqilya', en: 'Qalqilya', ar: 'قلقيلية' },
  { match: 'Salfit', en: 'Salfit', ar: 'سلفيت' },
  { match: 'Ramallah', en: 'Ramallah and al-Bireh', ar: 'رام الله والبيرة' },
  { match: 'Jericho', en: 'Jericho', ar: 'أريحا' },
  { match: 'Jerusalem', en: 'Jerusalem', ar: 'القدس' },
  { match: 'Bethlehem', en: 'Bethlehem', ar: 'بيت لحم' },
  { match: 'Hebron', en: 'Hebron', ar: 'الخليل' },
];

/** Where a governorate sits north to south (unknown last), and its name in the app's language. */
export function governorate(raw: string | null | undefined, lang: string): { order: number; name: string | null } {
  const i = raw ? GOVERNORATES.findIndex((g) => raw.includes(g.match)) : -1;
  if (i < 0) return { order: GOVERNORATES.length, name: null };
  return { order: i, name: lang === 'ar' ? GOVERNORATES[i].ar : GOVERNORATES[i].en };
}

/** Lower case, no Arabic vowel marks, one form of alef, ya and ta marbuta: "Huwwara" ≈ "حوّارة" ≈ "حواره". */
export function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // harakat, shadda, tatweel
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[-'’`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does the checkpoint match what was typed (either name, anywhere)? */
export function matchesQuery(row: { name_ar: string; name_en: string }, q: string): boolean {
  const want = foldName(q);
  if (!want) return true;
  return foldName(row.name_ar).includes(want) || foldName(row.name_en).includes(want);
}

/** Checkpoints grouped by governorate, north to south; names sorted inside each group. */
export function byGovernorate<T extends { governorate?: string | null; name_ar: string; name_en: string }>(
  rows: T[],
  lang: string,
): { key: string; name: string | null; rows: T[] }[] {
  const groups = new Map<number, { key: string; name: string | null; rows: T[] }>();
  for (const r of rows) {
    const g = governorate(r.governorate, lang);
    const group = groups.get(g.order) ?? { key: String(g.order), name: g.name, rows: [] };
    group.rows.push(r);
    groups.set(g.order, group);
  }
  const name = (r: T) => (lang === 'ar' ? r.name_ar : r.name_en);
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g]) => ({ ...g, rows: g.rows.sort((a, b) => name(a).localeCompare(name(b), lang)) }));
}
