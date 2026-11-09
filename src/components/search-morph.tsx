// "Where to?" grows into the search, in place (design C1a).
//
// The grey bar on Home lifts off, travels to the top of the screen and becomes a glass
// header with the route and the days. The trips fill the page under it, and the header
// gathers into one line as you scroll. × or a swipe down folds it back into the bar.
//
// It is a layer drawn over Home, not a screen of its own: a morph needs the bar and the
// page on screen at once, which a jump between two screens can't give.
//
// Motion: one spring value `p` (0 = the bar, 1 = the header) drives everything, on the UI
// thread. Opening is slightly under-damped, so the glass settles with one soft give; while
// it travels it stretches a little along the way it moves, like a drop. Closing is calmer.
// With "Reduce motion" on, it just appears and disappears.
//
// Frosted glass is only on the header,
// because that is the one thing floating over content that scrolls under it.

import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
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
import { colors, motion, radii, sizes, space } from '@/theme/tokens';

export type Rect = { x: number; y: number; width: number; height: number };

// The header's size: full (route + days), and gathered into one line after scrolling.
const PAD = 12;
const ROW = 40;
const FULL_H = PAD + ROW + 10 + sizes.controlSm + PAD;
const TIGHT_H = PAD + ROW + PAD;
const SIDE = 12; // the glass floats this far from the screen edges

const OPEN = { damping: 19, stiffness: 190, mass: 1 };
const CLOSE = { damping: 30, stiffness: 280, mass: 1, overshootClamping: true };
const GATHER = { damping: 24, stiffness: 260, mass: 1 };
// Swipe down to close: past this far, or flicked fast (same feel as the app's sheets).
const PULL_CLOSE = 90;

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
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();

  const p = useSharedValue(0);
  const tight = useSharedValue(0); // 0 = full header, 1 = gathered
  const gathered = useSharedValue(false);
  // Swipe down to close. `drag` = the header pulled by a finger (the page follows);
  // `pull` = the list pulled past its top (iOS rubber band; the header follows halfway).
  const drag = useSharedValue(0);
  const pull = useSharedValue(0);

  useEffect(() => {
    if (!closing) {
      p.value = reduced ? withTiming(1, { duration: 120 }) : withSpring(1, OPEN);
    } else {
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(onClosed)();
      };
      p.value = reduced ? withTiming(0, { duration: 120 }, done) : withSpring(0, CLOSE, done);
    }
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = insets.top + 6;
  const to = { x: SIDE, y: top, width: width - SIDE * 2 };

  // Scrolling the list gathers the header into one line; back at the top it opens again.
  // Pulling the list down past its top and letting go closes the search.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      pull.value = y < 0 ? -y : 0;
      const g = y > 24;
      if (g !== gathered.value) {
        gathered.value = g;
        tight.value = reduced ? withTiming(g ? 1 : 0, { duration: 120 }) : withSpring(g ? 1 : 0, GATHER);
      }
    },
    onEndDrag: (e) => {
      // iOS reports a pull-down flick as negative velocity (in points per millisecond).
      const fast = (e.velocity?.y ?? 0) < -motion.dismissVelocity / 1000;
      if (e.contentOffset.y < -PULL_CLOSE || (e.contentOffset.y < -12 && fast)) runOnJS(requestClose)();
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
      if (e.translationY > PULL_CLOSE || e.velocityY > motion.dismissVelocity) runOnJS(requestClose)();
      else drag.value = withTiming(0, { duration: motion.inMs });
    },
  });

  const glassStyle = useAnimatedStyle(() => {
    const h = interpolate(tight.value, [0, 1], [FULL_H, TIGHT_H]);
    // A drop stretches along the way it travels: most in the middle of the trip, none at rest.
    const k = Math.sin(Math.PI * Math.min(1, Math.max(0, p.value)));
    const stretch = reduced ? 0 : 0.05 * k;
    return {
      top: interpolate(p.value, [0, 1], [from.y, to.y], Extrapolation.EXTEND) + drag.value + pull.value * 0.5,
      left: interpolate(p.value, [0, 1], [from.x, to.x], Extrapolation.EXTEND),
      width: interpolate(p.value, [0, 1], [from.width, to.width], Extrapolation.EXTEND),
      height: interpolate(p.value, [0, 1], [from.height, h], Extrapolation.EXTEND),
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
  const days = useAnimatedStyle(() => ({ opacity: 1 - tight.value }));
  // Home fades under the porcelain while the page rises a little into place.
  // While you pull it down, the page lightens a little, so you can tell letting go will close it.
  const page = useAnimatedStyle(() => ({
    opacity:
      interpolate(p.value, [0, 0.6], [0, 1], Extrapolation.CLAMP) *
      interpolate(drag.value + pull.value, [0, PULL_CLOSE * 3], [1, 0.75], Extrapolation.CLAMP),
  }));
  const list = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(p.value, [0, 1], [48, 0], Extrapolation.CLAMP) + Math.max(0, drag.value) }],
  }));

  return (
    <Modal visible={!hidden} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => requestClose()}>
      {/* A Modal is its own native window, so gestures need their own root inside it. */}
      <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents={closing ? 'none' : 'auto'}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.page, page]}>
          <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingTop: top + FULL_H + space.md,
              paddingBottom: insets.bottom + space.xl,
              paddingHorizontal: space.screen,
              direction,
            }}
          >
            <Animated.View style={list}>
              <SearchResults s={s} onOpenTrip={onOpenTrip} />
            </Animated.View>
          </Animated.ScrollView>
        </Animated.View>

        {/* A porcelain band behind the status bar, so the list doesn't show through the clock. */}
        <Animated.View style={[styles.statusBand, { height: insets.top }, page]} pointerEvents="none" />

        <GestureDetector gesture={pan}>
        <Animated.View style={[styles.glass, glassStyle]}>
          {/* Frosted glass that stays light and readable. Apple's native Liquid Glass view turned
              into a flat grey slab here (it doesn't survive being resized every frame), so the
              moving header uses the blur that the app's glass buttons fall back to. */}
          <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
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
                <Text style={[styles.summary, { fontFamily: f.regular, textAlign: rtl ? 'right' : 'left' }]} numberOfLines={1}>
                  {s.dayLabels[s.day]}
                  {s.part ? ` · ${t(s.part === 'morning' ? 'partMorning' : s.part === 'afternoon' ? 'partAfternoon' : 'partEvening')}` : ''}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('swapDirection')} onPress={() => { tapFeel(); s.swap(); }} hitSlop={6} style={styles.round}>
                <Icon name="arrowsDownUp" size={18} />
              </Pressable>
            </View>
            <Animated.View style={[{ marginTop: 10 }, days]}>
              <DayChips s={s} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );

  function requestClose() {
    if (closing) return;
    tapFeel();
    // Let go of any pull, so the glass folds back from where your finger left it.
    drag.value = withTiming(0, { duration: motion.outMs });
    onRequestClose();
  }
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.surface },
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
  summary: { fontSize: 12, lineHeight: 16, color: colors.inkSecondary },
});
