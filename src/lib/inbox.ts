// The notifications inbox, as plain logic (no React), so it can be tested on its own.
// The database writes one row per message (see send_push() in the migrations).

export type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

export type InboxGroup = 'today' | 'week' | 'earlier';

/** Today / This week (the 6 days before today) / Earlier, newest first inside each. */
export function groupInbox(rows: Notification[], now: Date): { group: InboxGroup; rows: Notification[] }[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
  const buckets: Record<InboxGroup, Notification[]> = { today: [], week: [], earlier: [] };
  for (const r of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const at = new Date(r.created_at).getTime();
    buckets[at >= startOfToday ? 'today' : at >= startOfWeek ? 'week' : 'earlier'].push(r);
  }
  return (['today', 'week', 'earlier'] as const)
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({ group: g, rows: buckets[g] }));
}

/** The icon for a kind of message (Phosphor names from components/icon-paths). */
export function inboxIcon(kind: string) {
  if (kind === 'requested') return 'ticket' as const;
  if (kind === 'accepted') return 'check' as const;
  if (kind.startsWith('verification_')) return 'shieldCheck' as const;
  if (kind.startsWith('checkpoint_')) return 'barricade' as const;
  if (kind.startsWith('rate') || kind.startsWith('rated')) return 'star' as const;
  if (kind.startsWith('alert_')) return 'bell' as const;
  if (kind.includes('cancel') || kind === 'declined' || kind === 'expired' || kind === 'no_show') return 'x' as const;
  return 'clock' as const;
}

/**
 * Messages that need you are written in clay while unread (design rule: clay only
 * where something needs attention): a seat request to answer, a cancelled trip.
 */
export function needsYou(n: Pick<Notification, 'kind' | 'read_at'>): boolean {
  return n.read_at === null && ['requested', 'trip_cancelled', 'verification_rejected'].includes(n.kind);
}

export type InboxChange = { type: 'read'; id: number; readAt: string } | { type: 'delete'; id: number };

/** Apply a confirmed server action without resetting another message's state. */
export function applyInboxChange(rows: Notification[], change: InboxChange): Notification[] {
  if (change.type === 'delete') return rows.filter((n) => n.id !== change.id);
  return rows.map((n) => n.id === change.id && !n.read_at ? { ...n, read_at: change.readAt } : n);
}


/** Push payloads use strings so Postgres bigint IDs never lose precision. */
export function notificationIdFromPush(value: unknown): string | null {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}
