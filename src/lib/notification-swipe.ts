// Distance, not velocity, decides whether releasing performs an inbox action.
export type NotificationSwipeAction = 'read' | 'delete';

export function notificationSwipeMetrics(width: number) {
  'worklet';
  return { reveal: Math.min(112, Math.max(0, width) * 0.3), full: Math.max(0, width) * 0.72 };
}

export function clampNotificationSwipe(distance: number, width: number, rtl: boolean, canRead: boolean) {
  'worklet';
  const limit = Math.max(0, width);
  const value = Math.max(-limit, Math.min(limit, distance));
  const leading = rtl ? value < 0 : value > 0;
  return leading && !canRead ? 0 : value;
}

/** Called with final finger position on release; crossing and retreating does not commit. */
export function notificationSwipeResult(distance: number, width: number, rtl: boolean, canRead: boolean, canceled = false): { action: NotificationSwipeAction | null; offset: number } {
  'worklet';
  if (canceled || width <= 0) return { action: null, offset: 0 };
  const value = clampNotificationSwipe(distance, width, rtl, canRead);
  const { reveal, full } = notificationSwipeMetrics(width);
  if (Math.abs(value) >= full) {
    return { action: (rtl ? value < 0 : value > 0) ? 'read' : 'delete', offset: 0 };
  }
  return { action: null, offset: Math.abs(value) >= reveal / 2 ? Math.sign(value) * reveal : 0 };
}
