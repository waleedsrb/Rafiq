// "When do you leave?" as three wheels: hour, minutes (5-minute steps) and AM/PM (look B,
// Nov 11; replaces the time ruler, which looked nice but was hard to use). Each wheel bends
// away from you like a drum: rows above and below the middle tip back, shrink and fade.
// The roll runs on the UI thread, with a light tick for every row that passes the middle, and
// the card only hears the new time when the wheels come to rest.
//
// Above the wheels (DemandChart) a small chart shows, per half hour of the day, riders looking
// (bars up, clay) and other drivers already going (bars down, graphite). Tap a bar to jump.
//
// Earlier times today can't be kept: the wheels roll back up to `min` (now + 30, on the half
// hour). Digits and the chart always run left to right, also in Arabic.

import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Body, ltr, useFont } from '@/components/ui';
import { selectFeel } from '@/lib/haptics';
import { LAST, STEP, type SlotDemand } from '@/lib/leave-time';
import { useT } from '@/lib/session';
import { colors, fonts, space } from '@/theme/tokens';

const ROW = 44;
const VISIBLE = 4; // rows of height in view: the middle one plus 1.5 above and below
const H = ROW * VISIBLE;
const PAD = (H - ROW) / 2;

const HOURS = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const MINS = Array.from({ length: 60 / STEP }, (_, i) => String(i * STEP).padStart(2, '0'));

/** 24-hour minutes in, "2:30 PM" out. */
export function clockLabel(t: number, am: string, pm: string) {
  const h = Math.floor(t / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(t % 60).padStart(2, '0')} ${h >= 12 ? pm : am}`;
}

export function TimeWheels({
  minutes,
  min = 0,
  onChange,
}: {
  /** Minutes since midnight, in 5-minute steps. */
  minutes: number;
  /** Earliest pickable minute (today: now + 30, rounded up to the half hour). */
  min?: number;
  onChange: (minutes: number) => void;
}) {
  const { t } = useT();
  const h24 = Math.floor(minutes / 60);
  const want = { h: h24 % 12, m: Math.round((minutes % 60) / STEP), p: h24 >= 12 ? 1 : 0 };
  // What each wheel last came to rest on; a wheel reports, the others keep theirs.
  const rest = useRef(want);
  rest.current = want;

  const settle = (k: 'h' | 'm' | 'p', i: number) => {
    const next = { ...rest.current, [k]: i };
    const m = Math.min(LAST, (next.h + next.p * 12) * 60 + next.m * STEP);
    onChange(Math.max(min, m));
  };

  return (
    <View
      style={styles.wheels}
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
      <View pointerEvents="none" style={styles.band} />
      <Wheel items={HOURS} index={want.h} onRest={(i) => settle('h', i)} width={76} />
      <Text style={styles.colon}>:</Text>
      <Wheel items={MINS} index={want.m} onRest={(i) => settle('m', i)} width={76} />
      <Wheel items={[t('am'), t('pm')]} index={want.p} onRest={(i) => settle('p', i)} width={84} small />
    </View>
  );
}

function Wheel({ items, index, onRest, width, small }: { items: string[]; index: number; onRest: (i: number) => void; width: number; small?: boolean }) {
  const { f } = useFont();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(index * ROW);
  const at = useSharedValue(index); // the row in the middle right now
  const moving = useSharedValue(false);
  const told = useRef(index);
  const last = items.length - 1;

  const report = (i: number) => {
    told.current = i;
    onRest(i);
  };
  // Follow the value when it changes from outside (a chart tap, a new day, the earliest time).
  // No deps on purpose: when a roll lands on a time that isn't allowed (before the earliest
  // one today), the card keeps its time and the wheel has to roll back even though `index`
  // itself didn't change.
  useEffect(() => {
    if (told.current !== index) {
      told.current = index;
      ref.current?.scrollTo({ y: index * ROW, animated: true });
    }
  });

  const land = () => {
    'worklet';
    moving.value = false;
    // Always rest exactly on a row, even if the glide stopped a hair short.
    scrollTo(ref, 0, at.value * ROW, true);
    runOnJS(report)(at.value);
  };
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      moving.value = true;
    },
    onScroll: (e) => {
      y.value = e.contentOffset.y;
      const i = Math.max(0, Math.min(last, Math.round(e.contentOffset.y / ROW)));
      if (i !== at.value) {
        at.value = i;
        if (moving.value) runOnJS(selectFeel)();
      }
    },
    onEndDrag: (e) => {
      // A slow drag with no fling never sends momentum-end.
      if (Math.abs(e.velocity?.y ?? 0) < 0.05) land();
    },
    onMomentumEnd: () => {
      if (moving.value) land();
    },
  });

  return (
    <Animated.ScrollView
      ref={ref}
      style={{ width, height: H }}
      contentContainerStyle={{ paddingVertical: PAD }}
      contentOffset={{ x: 0, y: index * ROW }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ROW}
      decelerationRate={0.993}
      scrollEventThrottle={16}
      onScroll={onScroll}
      nestedScrollEnabled
      onLayout={() => ref.current?.scrollTo({ y: told.current * ROW, animated: false })}
    >
      {items.map((label, i) => (
        <Row key={i} i={i} y={y} label={label} small={small} font={small ? f.medium : fonts.en.medium} />
      ))}
    </Animated.ScrollView>
  );
}

/** One row: it tips back, shrinks and fades the further it is from the middle. */
function Row({ i, y, label, small, font }: { i: number; y: SharedValue<number>; label: string; small?: boolean; font: string }) {
  const style = useAnimatedStyle(() => {
    const d = (i * ROW - y.value) / ROW;
    const ad = Math.min(Math.abs(d), 3);
    return {
      opacity: Math.max(0.08, 1 - ad * 0.4),
      transform: [{ perspective: 400 }, { rotateX: `${Math.max(-80, Math.min(80, -d * 28))}deg` }, { scale: 1 - ad * 0.05 }],
    };
  });
  return (
    <Animated.View style={[styles.row, style]}>
      <Text style={[small ? styles.half : styles.digits, { fontFamily: font }]}>{label}</Text>
    </Animated.View>
  );
}

// ─── The chart ──────────────────────────────────────────────────────────────────

const FIRST = 12; // 6:00 AM
const END = 44; // up to 10:00 PM
const UP = 36; // tallest riders bar
const DOWN = 18; // tallest drivers bar

/** Riders looking (up) and other drivers going (down), per half hour from 6 AM to 10 PM. */
export function DemandChart({ slots, minutes, min = 0, onPick }: { slots: SlotDemand[]; minutes: number; min?: number; onPick: (m: number) => void }) {
  const { t } = useT();
  const { f } = useFont();
  // Widen the window when someone wants to go earlier or later than usual.
  const used = slots.map((s, i) => (s.riders || s.drivers ? i : -1)).filter((i) => i >= 0);
  const from = Math.min(FIRST, ...used);
  const to = Math.max(END, ...used.map((i) => i + 1));
  const topR = Math.max(1, ...slots.map((s) => s.riders));
  const topD = Math.max(1, ...slots.map((s) => s.drivers));
  const picked = Math.floor(minutes / 30);
  // Four hour marks under the bars: both ends and two in between.
  const marks = [0, 1, 2, 3].map((k) => from + Math.round(((to - from) * k) / 6) * 2).map((s) => {
    const h = Math.floor(s / 2) % 24;
    return { s, label: `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? t('pm') : t('am')}` };
  });

  return (
    <View style={styles.chart}>
      <View style={styles.legend}>
        <View style={styles.key}>
          <View style={[styles.swatch, { backgroundColor: colors.clay }]} />
          <Text style={[styles.keyText, { fontFamily: f.regular }]}>{t('ridersLooking')}</Text>
        </View>
        <View style={styles.key}>
          <View style={[styles.swatch, { backgroundColor: colors.ink }]} />
          <Text style={[styles.keyText, { fontFamily: f.regular }]}>{t('driversGoing')}</Text>
        </View>
      </View>
      <View style={styles.bars}>
        {Array.from({ length: to - from }, (_, k) => {
          const s = from + k;
          const d = slots[s] ?? { riders: 0, drivers: 0 };
          const past = (s + 1) * 30 <= min;
          const on = s === picked;
          return (
            <Pressable
              key={s}
              disabled={past}
              accessibilityRole="button"
              accessibilityLabel={`${clockLabel(s * 30, t('am'), t('pm'))}, ${demandWords(d, t)}`}
              onPress={() => {
                selectFeel();
                onPick(Math.max(min, s * 30));
              }}
              style={[styles.bar, on && styles.barOn, past && { opacity: 0.25 }]}
            >
              <View style={styles.upper}>
                <View style={[styles.riders, { height: d.riders ? 4 + (d.riders / topR) * (UP - 4) : 2, opacity: on ? 1 : 0.5 }]} />
              </View>
              <View style={styles.axis} />
              <View style={styles.lower}>
                {d.drivers ? <View style={[styles.drivers, { height: 4 + (d.drivers / topD) * (DOWN - 4), opacity: on ? 1 : 0.5 }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.marks}>
        {marks.map((m) => (
          <Text key={m.s} style={[styles.mark, { fontFamily: fonts.en.regular }]}>
            {m.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

type T = ReturnType<typeof useT>['t'];

/** "4 riders looking · no drivers yet" for one half hour. */
export function demandWords(d: SlotDemand, t: T): string {
  const r = d.riders === 0 ? t('noRidersAt') : d.riders === 1 ? t('riderAt1') : t('ridersAt').replace('{n}', String(d.riders));
  const g = d.drivers === 0 ? t('noDriversAt') : d.drivers === 1 ? t('driverAt1') : t('driversAt').replace('{n}', String(d.drivers));
  return `${r} · ${g}`;
}

/** The line under the wheels for the picked half hour. */
export function DemandLine({ slots, minutes }: { slots: SlotDemand[]; minutes: number }) {
  const { t } = useT();
  const d = slots[Math.floor(minutes / 30)] ?? { riders: 0, drivers: 0 };
  return (
    <Body small style={{ textAlign: 'center' }}>
      {ltr(demandWords(d, t))}
    </Body>
  );
}

const styles = StyleSheet.create({
  wheels: { height: H, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', direction: 'ltr' },
  band: { position: 'absolute', left: 8, right: 8, top: PAD, height: ROW, borderRadius: 14, backgroundColor: colors.sunken },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden' },
  digits: { fontSize: 28, color: colors.ink, fontVariant: ['tabular-nums'] },
  half: { fontSize: 19, color: colors.ink },
  colon: { fontFamily: fonts.en.bold, fontSize: 28, color: colors.ink, marginTop: -4 },

  chart: { gap: 6, direction: 'ltr' },
  legend: { flexDirection: 'row', gap: space.md },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  keyText: { fontSize: 12, color: colors.inkSecondary },
  bars: { flexDirection: 'row', gap: 1 },
  bar: { flex: 1, alignItems: 'center', borderRadius: 4, paddingVertical: 2 },
  barOn: { backgroundColor: colors.sunken },
  upper: { height: UP, justifyContent: 'flex-end', alignItems: 'center', alignSelf: 'stretch' },
  axis: { alignSelf: 'stretch', height: 1, backgroundColor: colors.hairline, marginVertical: 2 },
  lower: { height: DOWN, alignItems: 'center', alignSelf: 'stretch' },
  riders: { width: 6, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.clay },
  drivers: { width: 6, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.ink },
  marks: { flexDirection: 'row', justifyContent: 'space-between' },
  mark: { fontSize: 11, color: colors.inkSecondary },
});
