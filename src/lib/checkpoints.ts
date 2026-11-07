// Checkpoint status helpers (slice 7). The status itself is decided in the database
// (checkpoint_overview); this file only has the small pure pieces the screens share.

export type CheckpointStatus = 'open' | 'crowded' | 'closed';
export const STATUSES: CheckpointStatus[] = ['open', 'crowded', 'closed'];

/** Whole minutes between two moments, never negative. */
export function minutesAgo(then: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60000));
}
