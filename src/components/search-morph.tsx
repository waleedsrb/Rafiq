// "Where to?" grows into the search, in place (design C1a).
//
// The grey bar on Home lifts off, travels to the top of the screen and becomes a glass
// bar with just the route. The days, the time of day and the trips fill the page under it.
// × or a swipe down folds it back into the bar.
//
// It is a layer drawn over Home, not a screen of its own: a morph needs the bar and the
// page on screen at once, which a jump between two screens can't give.
//
// Motion: one spring value `p` (0 = the bar, 1 = the header) drives everything, on the UI
// thread. Opening is slightly under-damped, so the glass settles with one soft give; while
// it travels it stretches a little along the way it moves, like a drop.
// With "Reduce motion" on, it just appears and disappears.
//
// Closing: the list rides along under the bar and slides up into it, so the page looks
// swallowed by the bar while the bar glides back down into Home's grey "Where to?". It is a
// spring that starts at the speed of your swipe, so a flick and the × both feel continuous.
//
// Glass is only on the bar, the one thing floating over content that scrolls under it.
// While it moves and changes size it is a frosted blur (Apple's Liquid Glass view turns
// into a flat grey block if it moves or is resized every frame). Once it has settled at the
// top, real Liquid Glass (iOS 26) takes over, and the bar stays pinned while you swipe down
// (only the page under it follows your finger), so the glass never moves.

import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { DayChips, SearchResults, type SearchState } from '@/components/trip-search';
import { useFont } from '@/components/ui';
import { tapFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { colors, motion, radii, space } from '@/theme/tokens';

export type Rect = { x: number; y: number; width: number; height: number };

// The header is one calm line: close, the route, swap. Everything you choose sits below it.
const PAD = 8;
const ROW = 40;
const HEAD_H = PAD + ROW + PAD;
const SIDE = 12; // the glass floats this far from the screen edges

const OPEN = { damping: 19, stiffness: 190, mass: 1 };
// Swipe down to close: past this far, or flicked fast (same feel as the app's sheets).
const PULL_CLOSE = 90;
// Closing: a near-critically damped spring (no bounce near the bar) that keeps your swipe's speed.
const CLOSE = { damping: 24, stiffness: 150, mass: 1, overshootClamping: true };
// How far the list slides up into the bar as it folds away.
const TUCK = 220;
const LIQUID_GLASS = isLiquidGlassAvailable();

export function SearchMorph({
  from,
  s,
  hidden,
  closing,
  onRequestClose,
  onClosed,
  onOpenTrip,
}: {
  /** Where the bar is on screen, so the glass starts exactly on it. */
  from: Rect;
  s: SearchState;
  /** Hide without closing (a trip page is on top); the search is still here on return. */
  hidden: boolean;
  /** Set to fold the glass back into the bar; onClosed runs once it is there. */
  closing: boolean;
  /** × or the back button: the owner sets `closing`. */
  onRequestClose: () => void;
  onClosed: () => void;
  onOpenTrip: (tripId: string) => void;
}) {
  const { t } = useT();
  const { f, rtl, direction } = useFont();
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();

  const p = useSharedValue(0);
  // Swipe down to close. `drag` = the header pulled by a finger (the page follows);
  // `pull` = the list pulled past its top (iOS rubber band; the header follows halfway).
  const drag = useSharedValue(0);
  const pull = useSharedValue(0);
  const leaving = useSharedValue(0); // 1 while closing: the list tucks up instead of dropping down
  const flick = useSharedValue(0); // the swipe's speed when you let go, in points per second (down = +)
  // Real Liquid Glass only while the bar is still at the top (see the note at the top).
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!closing) {
      leaving.value = 0;
      const arrived = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(setSettled)(true);
      };
      p.value = reduced ? withTiming(1, { duration: 120 }, arrived) : withSpring(1, OPEN, arrived);
    } else {
      setSettled(false);
      leaving.value = 1;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(onClosed)();
      };
      // The spring starts at the finger's speed: p runs 1 -> 0 over the bar's trip down.
      const trip = Math.max(1, from.y - (insets.top + 6));
      p.value = reduced
        ? withTiming(0, { duration: 120 }, done)
        : withSpring(0, { ...CLOSE, velocity: -Math.max(0, flick.value) / trip }, done);
      drag.value = reduced ? 0 : withSpring(0, CLOSE);
    }
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = insets.top + 6;
  const to = { x: SIDE, y: top, width: width - SIDE * 2 };

  // Pulling the list down past its top and letting go closes the search.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      pull.value = y < 0 ? -y : 0;
    },
    onEndDrag: (e) => {
      // iOS reports a pull-down flick as negative velocity (in points per millisecond).
      const fast = (e.velocity?.y ?? 0) < -motion.dismissVelocity / 1000;
      if (e.contentOffset.y < -PULL_CLOSE || (e.contentOffset.y < -12 && fast)) {
        flick.value = -(e.velocity?.y ?? 0) * 1000;
        runOnJS(requestClose)();
      }
    },
  });

  // Dragging the header down works everywhere (Android lists don't rubber-band).
  const pan = usePanGesture({
    enabled: !closing,
    activeOffsetY: [-12, 12],
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      drag.value = e.translationY > 0 ? e.translationY : e.translationY / 8;
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > PULL_CLOSE || e.velocityY > motion.dismissVelocity) {
        flick.value = e.velocityY;
        runOnJS(requestClose)();
      } else drag.value = withTiming(0, { duration: motion.inMs });
    },
  });

  const glassStyle = useAnimatedStyle(() => {
    // A drop stretches along the way it travels: most in the middle of the trip, none at rest.
    const k = Math.sin(Math.PI * Math.min(1, Math.max(0, p.value)));
    const stretch = reduced ? 0 : 0.05 * k;
    return {
      // Pinned while you swipe: only the page follows the finger (moving Liquid Glass turns grey).
      top: interpolate(p.value, [0, 1], [from.y, to.y], Extrapolation.EXTEND),
      left: interpolate(p.value, [0, 1], [from.x, to.x], Extrapolation.EXTEND),
      width: interpolate(p.value, [0, 1], [from.width, to.width], Extrapolation.EXTEND),
      height: interpolate(p.value, [0, 1], [from.height, HEAD_H], Extrapolation.EXTEND),
      borderRadius: interpolate(p.value, [0, 1], [from.height / 2, 26], Extrapolation.CLAMP),
      transform: [{ scaleX: 1 - stretch * 0.5 }, { scaleY: 1 + stretch }],
    };
  });
  // The bar's own grey covers the glass at first and melts away as it lifts.
  const barSkin = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.45], [1, 0], Extrapolation.CLAMP) }));
  const face = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.25], [1, 0], Extrapolation.CLAMP) }));
  const head = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.4, 0.85], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(p.value, [0.4, 1], [6, 0], Extrapolation.CLAMP) }],
  }));
  // Home fades under the porcelain while the page rises a little into place.
  // While you pull it down, the page lightens a little, so you can tell letting go will close it.
  // When closing, the porcelain waits until the list has tucked away, then fades to Home.
  const page = useAnimatedStyle(() => ({
    opacity:
      interpolate(p.value, leaving.value ? [0, 0.3] : [0, 0.6], [0, 1], Extrapolation.CLAMP) *
      interpolate(drag.value + pull.value, [0, PULL_CLOSE * 3], [1, 0.75], Extrapolation.CLAMP),
  }));
  // Opening: the list rises a little into place.
  // Closing: the list slides up into the bar while the bar comes down, and the page is cut
  // off at the middle of the bar (see `clip`), so everything disappears into the glass.
  const list = useAnimatedStyle(() => {
    if (leaving.value) {
      return {
        opacity: interpolate(p.value, [0, 0.25], [0, 1], Extrapolation.CLAMP),
        transform: [
          { translateY: interpolate(p.value, [0, 1], [-TUCK, 0], Extrapolation.CLAMP) + Math.max(0, drag.value) },
          { scale: 1 },
        ],
      };
    }
    return {
      opacity: 1,
      transform: [{ translateY: interpolate(p.value, [0, 1], [48, 0], Extrapolation.CLAMP) + Math.max(0, drag.value) }, { scale: 1 }],
    };
  });

  // While closing, the page only exists below the middle of the bar: what goes above it is
  // gone, so the list reads as tucked under the glass, and Home shows above the bar as it lands.
  // (Read the shared values inside each style itself, so Reanimated sees them change.)
  const clip = useAnimatedStyle(() => ({
    top: leaving.value
      ? interpolate(p.value, [0, 1], [from.y + from.height / 2, to.y + HEAD_H / 2], Extrapolation.EXTEND)
      : 0,
  }));
  const unclip = useAnimatedStyle(() => ({
    top: leaving.value
      ? -interpolate(p.value, [0, 1], [from.y + from.height / 2, to.y + HEAD_H / 2], Extrapolation.EXTEND)
      : 0,
  }));

  return (
    <Modal visible={!hidden} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => requestClose()}>
      {/* A Modal is its own native window, so gestures need their own root inside it. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents={closing ? 'none' : 'auto'}>
        <Animated.View style={[styles.clip, clip]} pointerEvents="box-none">
        <Animated.View style={[styles.unclip, { height: screenH }, unclip]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.page, page]}>
          <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingTop: top + HEAD_H + space.md,
              paddingBottom: insets.bottom + space.xl,
              paddingHorizontal: space.screen,
              direction,
            }}
          >
            <Animated.View style={list}>
              <View style={{ gap: space.md }}>
                <DayChips s={s} />
                <SearchResults s={s} onOpenTrip={onOpenTrip} />
              </View>
            </Animated.View>
          </Animated.ScrollView>
        </Animated.View>

        {/* A porcelain band behind the status bar, so the list doesn't show through the clock. */}
        <Animated.View style={[styles.statusBand, { height: insets.top }, page]} pointerEvents="none" />
        </Animated.View>
        </Animated.View>

        <GestureDetector gesture={pan}>
        <Animated.View style={[styles.glass, glassStyle]}>
          {/* Frosted glass that stays light and readable. Apple's native Liquid Glass view turned
              into a flat grey slab here (it doesn't survive being resized every frame), so the
              moving header uses the blur that the app's glass buttons fall back to. */}
          <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
          {LIQUID_GLASS && settled && !closing ? (
            // No fade on purpose: Liquid Glass must never sit under a see-through parent.
            <GlassView style={[StyleSheet.absoluteFill, { borderRadius: 26 }]} glassEffectStyle="regular" pointerEvents="none" />
          ) : null}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.sunken }, barSkin]} pointerEvents="none" />

          {/* The bar's face, so the first frame looks exactly like what you tapped. */}
          <Animated.View style={[styles.face, { height: from.height, direction }, face]} pointerEvents="none">
            <Icon name="search" />
            <Text style={[styles.faceText, { fontFamily: f.bold }]}>{t('findSeatTitle')}</Text>
          </Animated.View>

          <Animated.View style={[styles.head, { width: to.width, direction }, head]}>
            <View style={styles.headRow}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('closeSearch')} onPress={requestClose} hitSlop={6} style={styles.round}>
                <Icon name="x" size={18} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.route, { fontFamily: f.bold, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                  {t(s.origin)} {rtl ? '←' : '→'} {t(s.destination)}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('swapDirection')} onPress={() => { tapFeel(); s.swap(); }} hitSlop={6} style={styles.round}>
                <Icon name="arrowsDownUp" size={18} />
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );

  function requestClose() {
    if (closing) return;
    tapFeel();
    onRequestClose();
  }
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.surface },
  clip: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  unclip: { position: 'absolute', left: 0, right: 0 },
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.surface },
  glass: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: radii.capsule,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  face: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  faceText: { fontSize: 18, color: colors.ink },
  head: { position: 'absolute', top: 0, left: 0, padding: PAD },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: ROW },
  round: {
    width: ROW,
    height: ROW,
    borderRadius: ROW / 2,
    backgroundColor: 'rgba(23,25,28,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  route: { fontSize: 16, lineHeight: 22, color: colors.ink },
});
