// Earnings and "driver cancelled" helpers: plain functions, so they can be tested
// without a phone. The numbers themselves come from my_earnings() in the database.

export type EarningRow = {
  trip_id: string;
  origin: string;
  destination: string;
  departs_at: string;
  riders: number;
  no_shows: number;
  earned_ils: number | string; // Postgres numeric arrives as a string
};

/** The calendar month around `now`, as [first instant, first instant of next month). */
export function monthRange(now: Date): { from: Date; to: Date } {
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  };
}

/** Total money and number of trips. */
export function totals(rows: EarningRow[]): { amount: number; trips: number } {
  return {
    amount: rows.reduce((sum, r) => sum + Number(r.earned_ils), 0),
    trips: rows.length,
  };
}

/**
 * Rows grouped by week, newest week first. Weeks start on Sunday: in Palestine
 * the work week runs Sunday to Thursday.
 */
export function byWeek(rows: EarningRow[]): { weekStart: Date; rows: EarningRow[]; amount: number }[] {
  const groups = new Map<number, EarningRow[]>();
  for (const r of rows) {
    const d = new Date(r.departs_at);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime();
    groups.set(start, [...(groups.get(start) ?? []), r]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([start, list]) => ({
      weekStart: new Date(start),
      rows: list.sort((a, b) => b.departs_at.localeCompare(a.departs_at)),
      amount: totals(list).amount,
    }));
}

/** How long before departure the driver cancelled: { hours: 3 } or { minutes: 40 }. */
export function noticeGiven(cancelledAt: Date, departsAt: Date): { hours: number } | { minutes: number } {
  const minutes = Math.max(0, Math.round((departsAt.getTime() - cancelledAt.getTime()) / 60_000));
  return minutes >= 60 ? { hours: Math.round(minutes / 60) } : { minutes };
}
