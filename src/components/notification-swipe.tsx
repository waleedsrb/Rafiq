// Inbox rows have two stages: reveal a button, or drag farther and release to act.
// ReanimatedSwipeable's open callback only reports a revealed panel, so it cannot
// distinguish those stages. This pan keeps the final finger distance explicit.
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { useFont } from '@/components/ui';
import { clampNotificationSwipe, notificationSwipeResult, type NotificationSwipeAction } from '@/lib/notification-swipe';
import { colors, motion, radii, sizes, space } from '@/theme/tokens';

export function NotificationSwipe({ children, id, busy, canRead, readLabel, deleteLabel, onRead, onDelete, onOpen }: {
  children: (onPress: (event?: unknown) => void) => ReactNode; onOpen: () => void; id: number; busy: boolean; canRead: boolean;
  readLabel: string; deleteLabel: string; onRead: () => void; onDelete: () => void;
}) {
  const { f, rtl } = useFont();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(0);
  const suppressPointerPress = useSharedValue(false);
  const armed = useSharedValue<NotificationSwipeAction | null>(null);
  const readPressed = useSharedValue(false);
  const deletePressed = useSharedValue(false);
  const duration = reduced ? 0 : motion.outMs;
  const perform = (action: NotificationSwipeAction) => {
    if (busy) return;
    armed.value = null;
    x.value = withTiming(0, { duration });
    if (action === 'read') onRead(); else onDelete();
  };
  useEffect(() => {
    if (busy || !canRead) {
      armed.value = null;
      x.value = withTiming(0, { duration });
    }
  }, [busy, canRead, duration, x, armed]);

  // touchAction is runtime-whitelisted in RNGH3, but excluded from its public
  // PanGestureConfig type. Keep the narrowly typed extension explicit.
  const panConfig: Parameters<typeof usePanGesture>[0] & { touchAction: 'pan-y' } = {
    enabled: !busy,
    // RNGH3 reapplies the hook config after renders; retain browser vertical
    // scrolling there as well as on the detector.
    touchAction: 'pan-y',
    activeOffsetX: [-16, 16],
    failOffsetY: [-10, 10],
    maxPointers: 1,
    onBegin: () => {
      'worklet';
      suppressPointerPress.value = false;
    },
    onActivate: () => {
      'worklet';
      suppressPointerPress.value = true;
      cancelAnimation(x);
      start.value = x.value;
      armed.value = null;
    },
    onUpdate: (e) => {
      'worklet';
      x.value = clampNotificationSwipe(start.value + e.translationX, width.value, rtl, canRead);
      armed.value = notificationSwipeResult(x.value, width.value, rtl, canRead).action;
    },
    onDeactivate: (e) => {
      'worklet';
      const result = notificationSwipeResult(start.value + e.translationX, width.value, rtl, canRead, e.canceled);
      // Arming is live drag feedback, never the state of a settling animation.
      armed.value = null;
      x.value = withTiming(result.offset, { duration });
      if (result.action) runOnJS(perform)(result.action);
    },
  };
  const pan = usePanGesture(panConfig);
  const openFromRow = (event?: unknown) => {
    // RN Web can synthesize a click after a successful pan. Suppress only that
    // pointer sequence, clearing on the next pointer begin. Keyboard activation
    // (detail=0) and the row's separate accessibility actions remain available.
    const keyboard = Platform.OS === 'web' && (event as { nativeEvent?: { detail?: number } } | undefined)?.nativeEvent?.detail === 0;
    if (busy || (suppressPointerPress.value && !keyboard)) return;
    if (x.value !== 0 && !keyboard) { x.value = withTiming(0, { duration }); return; }
    onOpen();
  };
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const leftStyle = useAnimatedStyle(() => ({ width: Math.max(0, x.value) }));
  const rightStyle = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));
  const readStyle = useAnimatedStyle(() => ({ backgroundColor: armed.value === 'read' || readPressed.value ? colors.ink : colors.sunken }));
  const deleteStyle = useAnimatedStyle(() => ({ backgroundColor: armed.value === 'delete' || deletePressed.value ? colors.statusClosed : colors.statusClosedSoft }));
  const readText = useAnimatedStyle(() => ({ color: armed.value === 'read' || readPressed.value ? colors.onInk : colors.ink }));
  const deleteText = useAnimatedStyle(() => ({ color: armed.value === 'delete' || deletePressed.value ? colors.onInk : colors.statusClosed }));

  const action = (kind: NotificationSwipeAction, fallback = false) => (
    <Animated.View style={[styles.action, kind === 'read' ? readStyle : deleteStyle]}>
      <Pressable accessibilityRole="button" accessible={fallback} tabIndex={fallback ? 0 : -1} disabled={busy}
        onPressIn={() => { (kind === 'read' ? readPressed : deletePressed).value = true; }}
        onPressOut={() => { (kind === 'read' ? readPressed : deletePressed).value = false; }}
        onPress={() => perform(kind)} style={styles.press}>
        <Animated.Text style={[styles.label, { fontFamily: f.medium }, kind === 'read' ? readText : deleteText]}>{kind === 'read' ? readLabel : deleteLabel}</Animated.Text>
      </Pressable>
    </Animated.View>
  );
  return <View>
    <View testID={`notification-swipe-${id}`} style={styles.clip} onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}>
      <Animated.View aria-hidden={Platform.OS === 'web' ? true : undefined} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.panel, { left: 0 }, leftStyle]}>{rtl ? action('delete') : canRead ? action('read') : null}</Animated.View>
      <Animated.View aria-hidden={Platform.OS === 'web' ? true : undefined} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.panel, { right: 0 }, rightStyle]}>{rtl ? canRead ? action('read') : null : action('delete')}</Animated.View>
      <GestureDetector gesture={pan} touchAction="pan-y">
        <Animated.View style={[styles.row, rowStyle]}>{children(openFromRow)}</Animated.View>
      </GestureDetector>
    </View>
    {Platform.OS === 'web' ? <View style={[styles.fallback, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>{canRead ? action('read', true) : null}{action('delete', true)}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  row: { backgroundColor: colors.surface },
  panel: { position: 'absolute', top: space.xs, bottom: space.xs, overflow: 'hidden' },
  action: { flex: 1, borderRadius: radii.md, overflow: 'hidden' },
  press: { flex: 1, minHeight: sizes.touch, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.sm },
  label: { fontSize: 14, maxWidth: 100, textAlign: 'center' },
  fallback: { gap: space.xs, paddingVertical: space.xs },
});
