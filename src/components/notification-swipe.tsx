// One inbox row you can swipe. A short drag reveals a round button (Read on the
// leading side, Delete on the trailing side, mirrored in Arabic). Dragging past 60%
// of the row arms it: the circle fills in and grows, the phone ticks, and letting
// go performs it. Delete slides the row out before the list closes the gap.
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
import { colors, motion, space } from '@/theme/tokens';

const CIRCLE = 44;

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

/** A round button with its word underneath: soft at rest, solid and a little bigger when armed. */
function Action({ kind, label, armed, font, reduced, onPress }: {
  kind: NotificationSwipeAction; label: string; armed: SharedValue<NotificationSwipeAction | null>;
  font: string; reduced: boolean; onPress: () => void;
}) {
  const soft = kind === 'read' ? colors.sunken : colors.statusClosedSoft;
  const solid = kind === 'read' ? colors.ink : colors.statusClosed;
  const tint = kind === 'read' ? colors.ink : colors.statusClosed;
  const circle = useAnimatedStyle(() => {
    const on = armed.value === kind;
    return {
      backgroundColor: on ? solid : soft,
      transform: [{ scale: withTiming(on ? 1.15 : 1, { duration: reduced ? 0 : 140 }) }],
    };
  });
  const glyphOn = useAnimatedStyle(() => ({ opacity: armed.value === kind ? 1 : 0 }));
  return (
    <Pressable onPress={onPress} style={styles.action} hitSlop={space.xs}>
      <Animated.View style={[styles.circle, circle]}>
        <Icon name={kind === 'read' ? 'envelopeOpen' : 'trash'} size={22} color={tint} />
        {/* The white glyph fades in on top when armed, so the colour change stays on the UI thread. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, glyphOn]}>
          <Icon name={kind === 'read' ? 'envelopeOpen' : 'trash'} size={22} color={colors.onInk} />
        </Animated.View>
      </Animated.View>
      <Animated.Text numberOfLines={1} style={[styles.label, { fontFamily: font, color: tint }]}>{label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  row: { backgroundColor: colors.surface },
  panel: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  action: { width: 80, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 16 },
});
