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
// nothing. While holding, taps you feel come closer together and get stronger, then a
// success buzz when the fill completes.

export const HOLD_MS = 1000;

/** Let go before this and we show "keep holding"; shorter is just a tap. */
export const TOO_SHORT_MS = 400;

/** 0 soft, 1 light, 2 medium, 3 heavy. */
export type FeelLevel = 0 | 1 | 2 | 3;

export const HOLD_TICKS: { at: number; level: FeelLevel }[] = [
  { at: 0, level: 0 },
  { at: 260, level: 0 },
  { at: 460, level: 1 },
  { at: 620, level: 1 },
  { at: 750, level: 2 },
  { at: 860, level: 2 },
  { at: 940, level: 3 },
];

/** What to say under the status: confirmed, not yet, or nothing when there is no status. */
export function confidence(row: { status: CheckpointStatus | null; confirmed?: boolean | null }): 'confirmed' | 'unconfirmed' | null {
  if (!row.status) return null;
  return row.confirmed ? 'confirmed' : 'unconfirmed';
}
