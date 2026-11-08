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
// nothing. While holding, quick taps you feel come closer together and get stronger,
// then a confirming buzz when the circle completes.

export const HOLD_MS = 1000;

/** Let go before this and we show "keep holding"; shorter is just a tap. */
export const TOO_SHORT_MS = 400;

/** 0 soft, 1 light, 2 medium, 3 heavy. */
export type FeelLevel = 0 | 1 | 2 | 3;

// Fast and building: the first gap is 80 ms, each next one a little shorter, down to 35 ms.
export const HOLD_TICKS: { at: number; level: FeelLevel }[] = (() => {
  const ticks: { at: number; level: FeelLevel }[] = [];
  let at = 0;
  let gap = 80;
  while (at < HOLD_MS - 30) {
    const share = at / HOLD_MS;
    ticks.push({ at, level: share < 0.3 ? 0 : share < 0.6 ? 1 : share < 0.85 ? 2 : 3 });
    at += gap;
    gap = Math.max(35, gap - 5);
  }
  return ticks;
})();

/** What to say under the status: confirmed, not yet, or nothing when there is no status. */
export function confidence(row: { status: CheckpointStatus | null; confirmed?: boolean | null }): 'confirmed' | 'unconfirmed' | null {
  if (!row.status) return null;
  return row.confirmed ? 'confirmed' : 'unconfirmed';
}

/** Where a report button sits in its row: the circle leans toward the middle of the row. */
export type RowSide = 'start' | 'middle' | 'end';
export function rowSide(index: number, count: number): RowSide {
  if (count < 2 || (count % 2 === 1 && index === (count - 1) / 2)) return 'middle';
  return index < count / 2 ? 'start' : 'end';
}
