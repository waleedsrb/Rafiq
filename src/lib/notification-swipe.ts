// Distance, not velocity, decides whether releasing performs an inbox action.
// A short drag reveals one round button; dragging past FULL_SHARE of the row and
// letting go performs it (like Mail).
export type NotificationSwipeAction = 'read' | 'delete';

/** The revealed button sits in this much room (a 44pt circle plus its label). */
export const REVEAL_WIDTH = 80;
/** Past this share of the row's width, letting go performs the action. */
export const FULL_SHARE = 0.6;

export function notificationSwipeMetrics(width: number) {
  'worklet';
  const w = Math.max(0, width);
  return { reveal: Math.min(REVEAL_WIDTH, w * 0.3), full: w * FULL_SHARE };
}

export function clampNotificationSwipe(distance: number, width: number, rtl: boolean, canRead: boolean) {
  'worklet';
  const limit = Math.max(0, width);
  const value = Math.max(-limit, Math.min(limit, distance));
  const leading = rtl ? value < 0 : value > 0;
  return leading && !canRead ? 0 : value;
}

/** Which action is armed at this offset (live feedback while dragging). */
export function notificationSwipeArmed(distance: number, width: number, rtl: boolean, canRead: boolean): NotificationSwipeAction | null {
  'worklet';
  if (width <= 0) return null;
  const value = clampNotificationSwipe(distance, width, rtl, canRead);
  if (Math.abs(value) < notificationSwipeMetrics(width).full) return null;
  return (rtl ? value < 0 : value > 0) ? 'read' : 'delete';
}

/** Called with final finger position on release; crossing and retreating does not commit. */
export function notificationSwipeResult(distance: number, width: number, rtl: boolean, canRead: boolean, canceled = false): { action: NotificationSwipeAction | null; offset: number } {
  'worklet';
  if (canceled || width <= 0) return { action: null, offset: 0 };
  const value = clampNotificationSwipe(distance, width, rtl, canRead);
  const action = notificationSwipeArmed(value, width, rtl, canRead);
  if (action) return { action, offset: 0 };
  const { reveal } = notificationSwipeMetrics(width);
  return { action: null, offset: Math.abs(value) >= reveal / 2 ? Math.sign(value) * reveal : 0 };
}
