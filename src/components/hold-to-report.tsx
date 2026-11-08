// Press-and-hold button for a checkpoint report (slice 15c).
//
// Press: the button takes its status's faded colour. Keep holding: a circle of the same
// colour grows out of the button (leaning toward the middle of the row, so the side
// buttons grow inward), just far enough to show around your finger, while quick taps
// you feel speed up and get stronger. At one second the button and circle turn solid,
// a confirming buzz plays, and the report is sent. Let go early and nothing is sent.
// Screen-reader users can't see the circle, so their "activate" (double tap) sends directly.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { STATUS_LOOK } from '@/components/checkpoint-badge';
import { Icon } from '@/components/icon';
import { useFont } from '@/components/ui';
import { HOLD_MS, HOLD_TICKS, TOO_SHORT_MS, type CheckpointStatus, type RowSide } from '@/lib/checkpoints';
import { buildFeel, confirmFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { colors, radii, sizes } from '@/theme/tokens';

const never = ReduceMotion.Never; // the circle IS the hold's progress, so it runs even with Reduce Motion
const HALO_OUT = 22; // how far the full circle shows above and below the button

export function HoldToReport({
  status,
  side = 'middle',
  onComplete,
  onTooShort,
  busy,
  disabled,
  style,
}: {
  style?: StyleProp<ViewStyle>; // e.g. flex: 1 in a row of three
  status: CheckpointStatus;
  side?: RowSide;
  onComplete: (status: CheckpointStatus) => void;
  onTooShort?: () => void;
  busy?: boolean; // this report is being sent: stay solid
  disabled?: boolean; // another report is being sent
}) {
  const { t } = useT();
  const { f } = useFont();
  const look = STATUS_LOOK[status];
  const grow = useSharedValue(0); // 0 hidden behind the button, 1 full size
  const haloOpacity = useSharedValue(0);
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

  // Once the parent has finished sending, show "sent" a moment longer, then back to normal.
  useEffect(() => {
    if (!done || busy) return;
    const timer = setTimeout(() => {
      setDone(false);
      grow.value = 0;
    }, 900);
    return () => clearTimeout(timer);
  }, [done, busy, grow]);

  const blocked = disabled || busy || done;

  function finish() {
    timers.current = [];
    setHolding(false);
    setDone(true);
    confirmFeel();
    // The circle turns solid for a beat, then fades away; the button stays solid.
    haloOpacity.value = withSequence(
      withTiming(0.9, { duration: 90, reduceMotion: never }),
      withDelay(220, withTiming(0, { duration: 380, easing: Easing.out(Easing.quad), reduceMotion: never })),
    );
    onComplete(status);
  }

  function start() {
    if (blocked) return;
    clearTimers();
    startedAt.current = Date.now();
    setHolding(true);
    grow.value = 0;
    haloOpacity.value = withTiming(0.32, { duration: 120, reduceMotion: never });
    // A short pause on the faded colour, then the circle grows for the rest of the second.
    grow.value = withDelay(120, withTiming(1, { duration: HOLD_MS - 120, easing: Easing.out(Easing.cubic), reduceMotion: never }));
    for (const tick of HOLD_TICKS) timers.current.push(setTimeout(() => buildFeel(tick.level), tick.at));
    timers.current.push(setTimeout(finish, HOLD_MS));
  }

  function stop() {
    if (!holding) return;
    clearTimers();
    setHolding(false);
    grow.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad), reduceMotion: never });
    haloOpacity.value = withTiming(0, { duration: 200, reduceMotion: never });
    if (Date.now() - startedAt.current < TOO_SHORT_MS) onTooShort?.();
  }

  function sendNow() {
    if (blocked) return;
    grow.value = 1;
    finish();
  }

  // The full circle reaches HALO_OUT above and below the button. Side buttons move it
  // toward the middle of the row (`start` flips with Arabic's right-to-left layout).
  const diameter = box.h + HALO_OUT * 2;
  const lean = side === 'start' ? 1 : side === 'end' ? -1 : 0;
  const shift = lean * Math.max(0, box.w / 2 - diameter / 4);
  const startScale = box.h / diameter; // starts hidden behind the button
  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ scale: startScale + (1 - startScale) * grow.value }],
  }));

  const ink = done ? colors.onInk : holding ? look.color : colors.ink;
  return (
    <View
      style={[styles.wrap, style, (holding || done) && { zIndex: 2 }]}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {box.w > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: diameter,
              height: diameter,
              borderRadius: diameter / 2,
              start: (box.w - diameter) / 2 + shift,
              top: (box.h - diameter) / 2,
              backgroundColor: look.color,
            },
            haloStyle,
          ]}
        />
      ) : null}
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
        style={[
          styles.button,
          { borderColor: holding || done ? look.color : colors.lineStrong },
          holding && { backgroundColor: look.soft },
          done && { backgroundColor: look.color },
          disabled && { opacity: 0.4 },
        ]}
      >
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
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'visible' },
  halo: { position: 'absolute' },
  button: {
    height: sizes.button,
    borderRadius: radii.capsule,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.card,
  },
  mark: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 16 },
});
