// Skeletons: soft grey shapes where content is about to appear, with a slow light
// sweeping across them, so a page that is still loading already has its shape.
//
// Two rules keep them calm:
// - They only show if loading takes a moment (DELAY_MS). A quick answer never flashes
//   grey, it just appears.
// - When the real content arrives they fade out under it instead of blinking away.
// With Reduce Motion on, the shapes stay still (no sweep).

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useFont } from '@/components/ui';
import { useT } from '@/lib/session';
import { inkWash, wash } from '@/theme/palettes';
import { useTheme } from '@/theme/theme';
import { radii, space } from '@/theme/tokens';

const DELAY_MS = 150;
const SWEEP_MS = 1100;
const PAUSE_MS = 400;
const BAND = 140;

/** One grey shape. Put several inside a <SkeletonGroup>. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = radii.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, dark } = useTheme();
  const { rtl } = useFont();
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduced || w === 0) return;
    x.value = 0;
    x.value = withRepeat(withDelay(PAUSE_MS, withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) })), -1, false);
  }, [reduced, w]); // eslint-disable-line react-hooks/exhaustive-deps

  // From the reading side: left to right in English, right to left in Arabic.
  const sweep = useAnimatedStyle(() => {
    const at = -BAND + x.value * (w + BAND);
    return { transform: [{ translateX: rtl ? w - at - BAND : at }] };
  });

  const highlight = dark ? wash(c.ink, 0.07) : wash(c.card, 0.8);
  const clear = dark ? wash(c.ink, 0) : wash(c.card, 0);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: inkWash(c, 0.06), overflow: 'hidden' }, style]}
    >
      {reduced ? null : (
        <Animated.View style={[styles.band, sweep]}>
          <LinearGradient colors={[clear, highlight, clear]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

/** Holds a page's skeleton: waits a beat before showing, fades out when the content comes. */
export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { t } = useT();
  return (
    <Animated.View
      entering={FadeIn.delay(DELAY_MS).duration(200)}
      exiting={FadeOut.duration(160)}
      accessible
      accessibilityLabel={t('loadingContent')}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** Stands in for a <ListRow>: a circle, a title and a subtitle line, same height. */
export function SkeletonRow({ last, circle = true, titleWidth = '55%', subtitleWidth = '35%' }: {
  last?: boolean;
  circle?: boolean;
  titleWidth?: DimensionValue;
  subtitleWidth?: DimensionValue;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: c.hairline }]}>
      {circle ? <Skeleton width={40} height={40} radius={20} /> : null}
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width={titleWidth} height={14} />
        <Skeleton width={subtitleWidth} height={11} />
      </View>
    </View>
  );
}

/** A few rows, for a list that is still loading. */
export function SkeletonList({ rows = 4, circle = true }: { rows?: number; circle?: boolean }) {
  const widths: DimensionValue[] = ['60%', '48%', '66%', '42%', '56%'];
  return (
    <SkeletonGroup>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} last={i === rows - 1} circle={circle} titleWidth={widths[i % widths.length]} />
      ))}
    </SkeletonGroup>
  );
}

/** Stands in for a <TripRow>: route, day and time, price on the end. */
export function SkeletonTripRows({ rows = 3 }: { rows?: number }) {
  const { c } = useTheme();
  return (
    <SkeletonGroup>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[styles.tripRow, { borderBottomColor: c.hairline }]}>
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={i % 2 ? '58%' : '64%'} height={16} />
            <Skeleton width="40%" height={12} />
          </View>
          <Skeleton width={36} height={16} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: space.sm },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
});
