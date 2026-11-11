// Pure logic for picking when a trip leaves: minutes since midnight in 5-minute steps,
// how early "today" may start, and the month grid of the calendar.
// Shared by the time ruler (components/time-ruler.tsx) and the day pills (components/day-pills.tsx).

export const STEP = 5;
/** The last pickable minute of a day: 23:55. */
export const LAST = 24 * 60 - STEP;
/** How long before leaving a trip can be posted at the latest. */
export const LEAD_MIN = 30;

/** Minutes since local midnight. */
export const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

/** Round to the nearest 5-minute step and keep it inside [min, 23:55]. */
export function snapMinutes(t: number, min = 0): number {
  return Math.max(min, Math.min(LAST, Math.round(t / STEP) * STEP));
}

/**
 * The earliest leaving time today: at least LEAD_MIN from now, on the next half hour,
 * so "now 1:55 PM" starts at 2:30 PM. Null when nothing is left today.
 */
export function earliestToday(now: Date): number | null {
  const t = Math.ceil((minutesOf(now) + LEAD_MIN) / 30) * 30;
  return t > LAST ? null : t;
}

/** "35 min" / "2 h 5 min" from a number of minutes (Arabic uses its own words). */
export function untilWords(mins: number, ar: boolean): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hs = h ? (ar ? `${h} س` : `${h} h`) : '';
  const ms = m || !h ? (ar ? `${m} د` : `${m} min`) : '';
  return [hs, ms].filter(Boolean).join(' ');
}

/** The half hour (0-47) a minute falls in, for the riders-looking bars. */
export const slotOf = (t: number) => Math.floor(t / 30);

/** Bars from the server's sparse answer: 48 counts, 0 where nobody is waiting. */
export function slotBars(rows: { slot: number; riders: number }[] | null | undefined): number[] {
  const bars = Array.from({ length: 48 }, () => 0);
  for (const r of rows ?? []) if (r.slot >= 0 && r.slot < 48) bars[r.slot] = r.riders;
  return bars;
}

/**
 * One month of the calendar, Sunday first. Each cell is a day index from today (0 = today,
 * negative = past) or null for the blanks before the 1st.
 */
export function monthCells(today: Date, monthOffset: number): { first: Date; cells: (number | null)[] } {
  const first = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const cells: (number | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let k = 1; k <= days; k++) {
    const d = new Date(first.getFullYear(), first.getMonth(), k).getTime();
    // Round, so a day that is 23 or 25 hours long (clock change) still counts as one.
    cells.push(Math.round((d - start) / 86_400_000));
  }
  return { first, cells };
}
