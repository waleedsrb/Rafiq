// "When do you leave?" as three wheels: hour, minutes (5-minute steps) and AM/PM (look B,
// Nov 11; replaces the time ruler, which looked nice but was hard to use). Each wheel bends
// away from you like a drum: rows above and below the middle tip back, shrink and fade.
// The roll runs on the UI thread, with one crisp tick for every number that passes the middle,
// and the card only hears the new time when the wheels come to rest. A wheel always stops
// exactly on a number (Nov 14: Waleed saw it hang between two).
//
// Under the wheels (DemandLine) one line says, for the picked half hour, how many riders are
// looking and how many other drivers are already going. (A day chart above the wheels was
// tried and dropped, Nov 11.)
//
// Earlier times today can't be kept: the wheels roll back up to `min` (now + 30, on the half
// hour). Digits always run left to right, also in Arabic.

import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
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
import { wheelTick } from '@/lib/haptics';
import { LAST, STEP, type SlotDemand } from '@/lib/leave-time';
import { useT } from '@/lib/session';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

const ROW = 54; // one number (a bit larger on Nov 14)
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
  const styles = useStyles();
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
      <Wheel items={HOURS} index={want.h} onRest={(i) => settle('h', i)} width={92} />
      <Text style={styles.colon}>:</Text>
      <Wheel items={MINS} index={want.m} onRest={(i) => settle('m', i)} width={92} />
      <Wheel items={[t('am'), t('pm')]} index={want.p} onRest={(i) => settle('p', i)} width={100} small />
    </View>
  );
}

function Wheel({ items, index, onRest, width, small }: { items: string[]; index: number; onRest: (i: number) => void; width: number; small?: boolean }) {
  const { f } = useFont();
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(index * ROW);
  const at = useSharedValue(index); // the row in the middle right now
  const moving = useSharedValue(false); // a finger or a glide is turning it
  const touching = useSharedValue(false); // a finger is on it
  const told = useRef(index);
  const last = items.length - 1;
  const offsets = items.map((_, i) => i * ROW);

  const report = (i: number) => {
    told.current = i;
    onRest(i);
  };

  // Safety net: once the wheel has been still for a moment, if it isn't exactly on a number
  // (a glide that ended without telling us), roll it onto the nearest one.
  const watch = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (watch.current) clearTimeout(watch.current);
  }, []);
  const settleWhenStill = () => {
    if (watch.current) clearTimeout(watch.current);
    let prev = Number.NaN;
    let tries = 0;
    const check = () => {
      if (touching.value) return;
      const cur = y.value;
      if (cur !== prev && tries++ < 40) {
        prev = cur;
        watch.current = setTimeout(check, 90);
        return;
      }
      const i = Math.max(0, Math.min(last, Math.round(cur / ROW)));
      moving.value = false;
      if (Math.abs(cur - i * ROW) > 0.5) ref.current?.scrollTo({ y: i * ROW, animated: true });
      if (told.current !== i) report(i);
    };
    watch.current = setTimeout(check, 90);
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
      touching.value = true;
    },
    onScroll: (e) => {
      y.value = e.contentOffset.y;
      const i = Math.max(0, Math.min(last, Math.round(e.contentOffset.y / ROW)));
      if (i !== at.value) {
        at.value = i;
        // One tick per number, only when you turn it (not when it rolls itself).
        if (moving.value) runOnJS(wheelTick)();
      }
    },
    onEndDrag: (e) => {
      touching.value = false;
      // A slow drag with no fling never sends momentum-end.
      if (Math.abs(e.velocity?.y ?? 0) < 0.05) land();
      runOnJS(settleWhenStill)();
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
      // Stops listed one by one plus the system's quick glide: this is what makes iOS land on
      // a number every time. The slower custom glide could coast to a stop between two.
      snapToOffsets={offsets}
      decelerationRate="fast"
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
  const styles = useStyles();
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

// ─── The line under the wheels ─────────────────────────────────────────────────

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

const useStyles = makeStyles((colors) => ({
  wheels: { height: H, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', direction: 'ltr' },
  band: { position: 'absolute', left: 4, right: 4, top: PAD, height: ROW, borderRadius: 16, backgroundColor: colors.sunken },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden' },
  digits: { fontSize: 34, color: colors.ink, fontVariant: ['tabular-nums'] },
  half: { fontSize: 22, color: colors.ink },
  colon: { fontFamily: fonts.en.bold, fontSize: 34, color: colors.ink, marginTop: -5 },

}));
