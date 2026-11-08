// Press-and-hold button for a checkpoint report (slice 15c).
//
// Hold for one second: the status colour grows out from the middle of the button while
// taps you feel come closer and stronger, then a success buzz and the report is sent.
// Let go early and nothing is sent; a quick tap shows "keep holding" via onTooShort.
// Screen-reader users can't see the fill, so their "activate" (double tap) sends directly.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, ReduceMotion, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { STATUS_LOOK } from '@/components/checkpoint-badge';
import { Icon } from '@/components/icon';
import { useFont } from '@/components/ui';
import { HOLD_MS, HOLD_TICKS, TOO_SHORT_MS, type CheckpointStatus } from '@/lib/checkpoints';
import { buildFeel, successFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { colors, radii, sizes } from '@/theme/tokens';

export function HoldToReport({
  status,
  onComplete,
  onTooShort,
  busy,
  disabled,
}: {
  status: CheckpointStatus;
  onComplete: (status: CheckpointStatus) => void;
  onTooShort?: () => void;
  busy?: boolean; // this report is being sent: stay filled
  disabled?: boolean; // another report is being sent
}) {
  const { t } = useT();
  const { f } = useFont();
  const look = STATUS_LOOK[status];
  const progress = useSharedValue(0);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: sizes.button });
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedAt = useRef(0);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // Once the parent has finished sending, show "sent" a moment longer, then empty again.
  useEffect(() => {
    if (!done || busy) return;
    const timer = setTimeout(() => {
      setDone(false);
      progress.value = withTiming(0, { duration: 250, reduceMotion: ReduceMotion.Never });
    }, 900);
    return () => clearTimeout(timer);
  }, [done, busy, progress]);

  const blocked = disabled || busy || done;

  function start() {
    if (blocked) return;
    clearTimers();
    startedAt.current = Date.now();
    setHolding(true);
    // The fill is the progress bar of the hold itself, so it runs even with Reduce Motion on.
    progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never });
    for (const tick of HOLD_TICKS) timers.current.push(setTimeout(() => buildFeel(tick.level), tick.at));
    timers.current.push(
      setTimeout(() => {
        timers.current = [];
        setHolding(false);
        setDone(true);
        successFeel();
        onComplete(status);
      }, HOLD_MS),
    );
  }

  function stop() {
    if (!holding) return;
    clearTimers();
    setHolding(false);
    progress.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never });
    if (Date.now() - startedAt.current < TOO_SHORT_MS) onTooShort?.();
  }

  function sendNow() {
    if (blocked) return;
    progress.value = 1;
    setDone(true);
    successFeel();
    onComplete(status);
  }

  // A circle from the middle that just covers the corners when full.
  const diameter = Math.ceil(Math.hypot(box.w, box.h)) + 2;
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scale: progress.value }] }));
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 0.12, 1], [1, 0.97, 0.97]) }],
  }));

  const ink = done ? colors.onInk : holding ? look.color : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(look.word)}
      accessibilityHint={t('holdToReportHint')}
      accessibilityState={{ disabled: !!blocked, busy: !!busy }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && sendNow()}
      onPressIn={start}
      onPressOut={stop}
      disabled={!!disabled}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Animated.View
        style={[
          styles.button,
          { borderColor: holding || done ? look.color : colors.lineStrong },
          done && { backgroundColor: look.color },
          disabled && { opacity: 0.4 },
          pressStyle,
        ]}
      >
        {!done && box.w > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fill,
              {
                width: diameter,
                height: diameter,
                borderRadius: diameter / 2,
                left: (box.w - diameter) / 2,
                top: (box.h - diameter) / 2,
                backgroundColor: look.soft,
              },
              fillStyle,
            ]}
          />
        ) : null}
        {done ? (
          <Icon name="check" size={18} color={ink} />
        ) : look.icon ? (
          <Icon name={look.icon} size={18} color={holding ? look.color : colors.ink} />
        ) : (
          <Text style={[styles.mark, { color: ink }]}>!</Text>
        )}
        <Text style={[styles.label, { fontFamily: f.medium, color: ink }]} numberOfLines={1}>
          {done ? t('reportSent') : t(look.word)}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: sizes.button,
    borderRadius: radii.capsule,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
  },
  fill: { position: 'absolute' },
  mark: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 16 },
});
