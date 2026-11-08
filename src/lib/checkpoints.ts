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
