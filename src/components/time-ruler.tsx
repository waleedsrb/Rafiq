// "When do you leave?" as a ruler you slide (look C, Nov 11): the day runs left to right in
// 5-minute ticks under a fixed clay needle, and the big time above changes with it, all
// digits at once. Each 5-minute step gives a light tick. The slide runs on the UI thread.
//
// Earlier times today can't be reached: the ruler stops at `min` (now + 30 minutes, on the
// next half hour), so there is no "pick an upcoming time" error any more.
//
// Above the ticks, small bars show how many riders have an open ride alert for each half hour
// (`bars`, 48 numbers). They are left out when nobody is waiting.
//
// Digits and the ruler always run left to right, also in Arabic.

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { Body, ltr, useFont } from '@/components/ui';
import { selectFeel } from '@/lib/haptics';
import { LAST, STEP } from '@/lib/leave-time';
import { useT } from '@/lib/session';
import { colors, fonts, space } from '@/theme/tokens';

const PX = 8; // width of one 5-minute step
const TICKS = 24 * 12; // 288 steps in a day
const H = 104; // ruler height
const BASE = 72; // y of the ticks' baseline (bars sit above, hour labels below)
const BAR_MAX = 40;

const DIGIT = 56; // big time
const DIGIT_H = 64;

/** 24-hour minutes in, "2:30" + PM out. */
function parts(t: number) {
  const h = Math.floor(t / 60) % 24;
  return { h12: h % 12 === 0 ? 12 : h % 12, m: t % 60, pm: h >= 12 };
}
export function clockLabel(t: number, am: string, pm: string) {
  const p = parts(t);
  return `${p.h12}:${String(p.m).padStart(2, '0')} ${p.pm ? pm : am}`;
}

export function TimeRuler({
  minutes,
  min = 0,
  onChange,
  bars,
}: {
  /** Minutes since midnight, in 5-minute steps. */
  minutes: number;
  /** Earliest pickable minute (today: now + 30, rounded up to the half hour). */
  min?: number;
  onChange: (minutes: number) => void;
  /** Riders looking per half hour (48 numbers), or nothing to hide the bars. */
  bars?: number[];
}) {
  const { t } = useT();
  const { f } = useFont();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const [w, setW] = useState(0);
  const xOf = (m: number) => (m / STEP) * PX;
  // The slide runs on the UI thread: the time on screen follows the finger frame by frame,
  // and the card (the parent) only hears the new time when the ruler comes to rest.
  // Before, every 5-minute tick re-drew the whole card and the drag stuttered.
  const cur = useSharedValue(minutes);
  const dragging = useSharedValue(false);
  const told = useRef(minutes);
  const lo = useSharedValue(min);
  useEffect(() => {
    lo.value = min;
  }, [min, lo]);
  const am = t('am');
  const pm = t('pm');

  const report = (m: number) => {
    told.current = m;
    onChange(m);
  };

  // Follow the value when it changes from outside (a new day pushes it past `min`, a prefill).
  useEffect(() => {
    if (w && told.current !== minutes) {
      told.current = minutes;
      cur.value = minutes;
      ref.current?.scrollTo({ x: xOf(minutes), animated: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, w]);
  // Put the ruler on the value once it has a width (contentOffset alone is iOS-only).
  useEffect(() => {
    if (w) ref.current?.scrollTo({ x: xOf(told.current), animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);

  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      dragging.value = true;
    },
    onScroll: (e) => {
      if (!dragging.value) return;
      const m = Math.max(lo.value, Math.min(LAST, Math.round(e.contentOffset.x / PX) * STEP));
      if (m !== cur.value) {
        cur.value = m;
        runOnJS(selectFeel)();
      }
    },
    onEndDrag: (e) => {
      // A slow drag with no fling never sends momentum-end.
      if (Math.abs(e.velocity?.x ?? 0) < 0.05) {
        dragging.value = false;
        if (e.contentOffset.x < (lo.value / STEP) * PX - 1) scrollTo(ref, (lo.value / STEP) * PX, 0, true);
        runOnJS(report)(cur.value);
      }
    },
    onMomentumEnd: (e) => {
      if (!dragging.value) return;
      dragging.value = false;
      // Let go before the earliest time? Glide back to it.
      if (e.contentOffset.x < (lo.value / STEP) * PX - 1) scrollTo(ref, (lo.value / STEP) * PX, 0, true);
      runOnJS(report)(cur.value);
    },
  });

  const hasBars = !!bars && bars.some((b) => b > 0);
  const top = hasBars ? Math.max(...bars!) : 0;
  const busiest = hasBars ? bars!.indexOf(top) * 30 : null;

  const pad = w / 2;
  const art = useMemo(() => {
    if (!w) return null;
    const lines: React.ReactNode[] = [];
    if (hasBars) {
      bars!.forEach((b, i) => {
        if (!b) return;
        const h = Math.max(4, (b / top) * BAR_MAX);
        const past = (i + 1) * 30 <= min;
        lines.push(
          <Rect
            key={`b${i}`}
            x={pad + i * 6 * PX + 2}
            y={BASE - 8 - h}
            width={6 * PX - 4}
            height={h}
            rx={4}
            fill={b === top ? colors.clay : colors.ink}
            opacity={past ? 0.08 : b === top ? 0.85 : 0.16}
          />,
        );
      });
    }
    for (let k = 0; k < TICKS; k++) {
      const x = pad + k * PX;
      const hour = k % 12 === 0;
      const half = k % 6 === 0;
      const past = k * STEP < min;
      lines.push(
        <Line
          key={`t${k}`}
          x1={x}
          x2={x}
          y1={BASE}
          y2={BASE - (hour ? 22 : half ? 14 : 8)}
          stroke={colors.inkSecondary}
          strokeWidth={hour ? 2 : 1}
          strokeLinecap="round"
          opacity={past ? 0.2 : hour ? 0.9 : 0.45}
        />,
      );
      if (hour) {
        const hh = k / 12;
        const label = hh === 0 ? '12a' : hh < 12 ? `${hh}a` : hh === 12 ? '12p' : `${hh - 12}p`;
        lines.push(
          <SvgText key={`l${k}`} x={x} y={BASE + 20} fontSize={11} fontFamily={fonts.en.regular} fill={colors.inkSecondary} textAnchor="middle" opacity={past ? 0.35 : 1}>
            {label}
          </SvgText>,
        );
      }
    }
    return lines;
  }, [w, pad, bars, hasBars, top, min]);

  return (
    <View style={styles.wrap}>
      <LiveTime value={cur} initial={minutes} am={am} pm={pm} />
      <View
        style={styles.ruler}
        onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('leaveTime')}
        accessibilityValue={{ text: clockLabel(minutes, t('am'), t('pm')) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const next = minutes + (e.nativeEvent.actionName === 'increment' ? STEP : -STEP);
          if (next >= min && next <= LAST) onChange(next);
        }}
      >
        {w ? (
          <Animated.ScrollView
            ref={ref}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: xOf(minutes), y: 0 }}
            snapToInterval={PX}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={onScroll}
            nestedScrollEnabled
          >
            <Svg width={TICKS * PX + pad * 2} height={H}>
              {art}
            </Svg>
          </Animated.ScrollView>
        ) : null}
        <View pointerEvents="none" style={[styles.needle, { left: w / 2 - 1 }]} />
        <View pointerEvents="none" style={[styles.needleDot, { left: w / 2 - 5 }]} />
      </View>
      {hasBars && busiest !== null ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={styles.legendSwatch} />
            <Body muted small>
              {t('ridersLooking')}
            </Body>
          </View>
          <Text style={[styles.legendText, { fontFamily: f.regular }]}>
            {t('busiestAt').replace('{t}', ltr(clockLabel(busiest, t('am'), t('pm'))))}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/**
 * The big time, drawn on the UI thread so it keeps up with the finger. All digits change
 * together on each 5-minute step (no rolling columns). A read-only TextInput is the usual
 * Reanimated way to change text without a React render.
 */
function LiveTime({ value, initial, am, pm }: { value: SharedValue<number>; initial: number; am: string; pm: string }) {
  const { f } = useFont();
  const clock = useAnimatedProps(() => {
    const h = Math.floor(value.value / 60) % 24;
    const m = value.value % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { text: `${h12}:${m < 10 ? '0' : ''}${m}`, defaultValue: '' } as never;
  });
  const half = useAnimatedProps(() => ({ text: Math.floor(value.value / 60) % 24 >= 12 ? pm : am, defaultValue: '' }) as never);
  // First frame only; after that the UI thread writes the text.
  const p = parts(initial);
  return (
    <View style={styles.time} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AnimatedInput
        editable={false}
        underlineColorAndroid="transparent"
        style={styles.digits}
        defaultValue={`${p.h12}:${String(p.m).padStart(2, '0')}`}
        animatedProps={clock}
      />
      <AnimatedInput editable={false} style={[styles.ampm, { fontFamily: f.medium }]} defaultValue={p.pm ? pm : am} animatedProps={half} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  time: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', direction: 'ltr' },
  // Tabular digits so the time keeps its width as it changes.
  digits: {
    fontFamily: fonts.en.bold,
    fontSize: DIGIT,
    height: DIGIT_H,
    padding: 0,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    minWidth: DIGIT * 2.6,
    textAlign: 'right',
  },
  ampm: { fontSize: 20, color: colors.ink, marginStart: 6, marginBottom: 10, padding: 0, minWidth: 34 },
  // Edge to edge inside the trip card (its body has 18pt sides).
  ruler: { height: H, marginHorizontal: -18, direction: 'ltr' },
  needle: { position: 'absolute', top: 0, bottom: H - BASE + 6, width: 2, borderRadius: 1, backgroundColor: colors.clay },
  needleDot: { position: 'absolute', top: BASE + 1, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.clay },
  legend: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3, backgroundColor: colors.ink, opacity: 0.16 },
  legendText: { fontSize: 13, color: colors.inkSecondary },
});
