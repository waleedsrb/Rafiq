// One inbox row you can swipe. A short drag reveals a soft capsule button (Read on the
// leading side, Delete on the trailing side, mirrored in Arabic). Dragging past 60%
// of the row arms it: the capsule turns solid, the phone ticks, and letting
// go performs it. Delete slides the row out before the list closes the gap.
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { useFont } from '@/components/ui';
import { tapFeel } from '@/lib/haptics';
import { clampNotificationSwipe, notificationSwipeArmed, notificationSwipeResult, type NotificationSwipeAction } from '@/lib/notification-swipe';
import { colors, motion, radii, space } from '@/theme/tokens';

export function NotificationSwipe({ children, canRead, readLabel, deleteLabel, onRead, onDelete }: {
  /** The row itself. It receives a press handler that first closes an open swipe. */
  children: (onPress: (open: () => void) => void) => ReactNode;
  canRead: boolean;
  readLabel: string;
  deleteLabel: string;
  onRead: () => void;
  onDelete: () => void;
}) {
  const { f, rtl } = useFont();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(0);
  const armed = useSharedValue<NotificationSwipeAction | null>(null);
  const duration = reduced ? 0 : motion.outMs;
  // Which way the row leaves when deleted: towards the trailing edge.
  const away = rtl ? 1 : -1;

  const read = () => {
    x.value = withTiming(0, { duration });
    onRead();
  };
  const remove = () => {
    // Slide all the way out first, then let the list close the gap.
    x.value = withTiming(away * (width.value + space.lg), { duration }, (done) => {
      if (done) runOnJS(onDelete)();
    });
  };

  const pan = usePanGesture({
    activeOffsetX: [-16, 16],
    failOffsetY: [-10, 10],
    maxPointers: 1,
    onActivate: () => {
      'worklet';
      cancelAnimation(x);
      start.value = x.value;
      armed.value = null;
    },
    onUpdate: (e) => {
      'worklet';
      x.value = clampNotificationSwipe(start.value + e.translationX, width.value, rtl, canRead);
      const next = notificationSwipeArmed(x.value, width.value, rtl, canRead);
      if (next !== null && next !== armed.value) runOnJS(tapFeel)();
      armed.value = next;
    },
    onDeactivate: (e) => {
      'worklet';
      const result = notificationSwipeResult(start.value + e.translationX, width.value, rtl, canRead, e.canceled);
      armed.value = null;
      if (result.action === 'delete') {
        x.value = withTiming(away * (width.value + space.lg), { duration }, (done) => {
          if (done) runOnJS(onDelete)();
        });
        return;
      }
      x.value = withTiming(result.offset, { duration });
      if (result.action === 'read') runOnJS(onRead)();
    },
  });

  const press = (open: () => void) => {
    // A tap on a row with a button showing just closes it, like Mail.
    if (x.value !== 0) { x.value = withTiming(0, { duration }); return; }
    open();
  };

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const leftStyle = useAnimatedStyle(() => ({ width: Math.max(0, x.value) }));
  const rightStyle = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));

  const readButton = canRead ? <Action kind="read" label={readLabel} armed={armed} font={f.medium} reduced={reduced} onPress={read} /> : null;
  const deleteButton = <Action kind="delete" label={deleteLabel} armed={armed} font={f.medium} reduced={reduced} onPress={remove} />;
  return (
    <View style={styles.clip} onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}>
      {/* Screen readers use the row's own actions instead of these buttons. */}
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.panel, { left: 0 }, leftStyle]}>
        {rtl ? deleteButton : readButton}
      </Animated.View>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.panel, { right: 0 }, rightStyle]}>
        {rtl ? readButton : deleteButton}
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, rowStyle]}>{children(press)}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/** A soft capsule with an icon and its word: tinted at rest, solid when armed. */
function Action({ kind, label, armed, font, reduced, onPress }: {
  kind: NotificationSwipeAction; label: string; armed: SharedValue<NotificationSwipeAction | null>;
  font: string; reduced: boolean; onPress: () => void;
}) {
  const soft = kind === 'read' ? colors.sunken : colors.statusClosedSoft;
  const solid = kind === 'read' ? colors.ink : colors.statusClosed;
  const tint = kind === 'read' ? colors.ink : colors.statusClosed;
  const icon = kind === 'read' ? 'envelopeOpen' : 'trash';
  const capsule = useAnimatedStyle(() => ({
    backgroundColor: withTiming(armed.value === kind ? solid : soft, { duration: reduced ? 0 : 120 }),
  }));
  // The white icon and word fade in on top when armed, so the change stays on the UI thread.
  const whiteOn = useAnimatedStyle(() => ({ opacity: withTiming(armed.value === kind ? 1 : 0, { duration: reduced ? 0 : 120 }) }));
  const content = (color: string) => (
    <>
      <Icon name={icon} size={22} color={color} />
      <Text numberOfLines={1} style={[styles.label, { fontFamily: font, color }]}>{label}</Text>
    </>
  );
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <Animated.View style={[styles.capsule, capsule]}>
        {content(tint)}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, whiteOn]}>{content(colors.onInk)}</Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  row: { backgroundColor: colors.surface },
  panel: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden', flexDirection: 'row' },
  action: { flex: 1, paddingVertical: 6, paddingHorizontal: space.xs },
  capsule: { flex: 1, borderRadius: radii.container, alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 12, lineHeight: 16, maxWidth: 72, textAlign: 'center' },
});
