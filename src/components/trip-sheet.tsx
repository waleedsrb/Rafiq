// The frame every trip state lives in (design B with A's bar, Nov 9):
// the route map fills the screen, and the trip sits on a glass card floating over it.
//
// - Three heights: middle (where it opens), full (swipe up) and the glass bar (swipe down),
//   which shows the time, one line on where things stand, and the state's one button.
// - It grows out of whatever you tapped (a search result, a row in My trips) and folds
//   back into it when you close it. Opened from nowhere in particular, it rises from below.
// - Each state only fills the slots: header (label, time, route), body, footer, bar.
//
// Motion: two values on the UI thread. `p` is the morph (0 = the row you tapped, 1 = in
// place); `pos` is the height (0 = bar, 1 = middle, 2 = full). The card's frame is worked
// out from both every frame. Apple's Liquid Glass (tinted) goes on the card and the bar once
// they've settled: native glass turns into a grey slab while its size animates (see search-morph).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedRef,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { RouteMap } from '@/components/route-map';
import { GlassButton, useFont } from '@/components/ui';
import { shortTime } from '@/lib/format';
import { tapFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import type { LatLng } from '@/lib/places';
import type { Rect } from '@/lib/trip-layer';
import type { City } from '@/lib/trip-form';
import { Glass, LIQUID_GLASS } from '@/components/glass';
import { useScreenCorners } from '@/theme/screen-corners';
import { colors, fonts, shadows, sizes, space } from '@/theme/tokens';

export type Detent = 'mini' | 'mid' | 'full';
export type SheetAction = { label: string; onPress: () => void; secondary?: boolean; loading?: boolean };
export type SheetMini = { sub: string; tone?: 'clay' | 'ok'; action?: SheetAction | null };

const BAR_H = 64;
// How far the card floats from the screen edges, and its corners, come from the phone itself
// (useScreenCorners): the corners are concentric with the display's, like Find My's sheet.
const POS: Record<Detent, number> = { mini: 0, mid: 1, full: 2 };
const DETENTS: Detent[] = ['mini', 'mid', 'full'];

const OPEN = { damping: 24, stiffness: 200, mass: 1 };
const SNAP = { damping: 26, stiffness: 260, mass: 1, overshootClamping: true };
// A step asking for a new height (Request opening up): a softer spring than a drag's snap,
// but one that never overshoots, so the card settles instead of bouncing.
const SHIFT = { damping: 30, stiffness: 200, mass: 1, overshootClamping: true };
// Swapping steps inside the card: a short slide and fade that decelerates and stops (no
// spring), like iOS pushing content inside a sheet. Calm, and quick enough to stay out of the way.
const STEP_EASE = Easing.bezier(0.2, 0, 0, 1);
const STEP_SLIDE = 16;
const STEP_MS = 280;
const CLOSE = { damping: 30, stiffness: 280, mass: 1, overshootClamping: true };
// A flick faster than this (points per second) moves one height in that direction.
const FLICK = 600;

/** Where the card's top edge rests at the middle height (so a map behind it can centre on what's visible). */
export const sheetMidTop = (screenHeight: number) => Math.round(screenHeight * 0.44);

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

export function TripSheet({
  origin,
  destination,
  departsAt,
  header,
  body,
  footer,
  mini,
  from,
  settled,
  start = 'mid',
  want,
  closing,
  onRequestClose,
  onClosed,
  onShare,
  step,
  map,
  pickup,
}: {
  origin: City;
  destination: City;
  departsAt: string;
  header: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  mini: SheetMini;
  /** What was tapped, so the card grows out of it. Null: rise from below. */
  from: Rect | null;
  /** Already open (coming back to it): skip the opening morph. */
  settled?: boolean;
  start?: Detent;
  /** Move to a height from outside (a step that needs room, Request opening the bar). */
  want?: { to: Detent; key: number } | null;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  onShare?: (() => void) | null;
  /** Which step is showing (details, request...) and how deep it is, so a new step slides in
   *  from the side it comes from instead of swapping in place. */
  step?: { key: string; depth: number };
  /** A different map behind the card (posting a trip: the pickup picker). Default: the route. */
  map?: ReactNode;
  /** Where the driver meets riders: the route line starts there instead of the city square. */
  pickup?: LatLng | null;
}) {
  const { t } = useT();
  const { f, rtl, direction } = useFont();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const corners = useScreenCorners();
  // The card (middle and full) floats a few points in from the sides and bottom, with corners
  // that follow the screen's (screen radius minus that gap: concentric, Apple's Liquid Glass rule).
  const M = corners.inset;
  const R = corners.card;
  const cardBottom = corners.inset;

  // The three heights, as the card's top edge.
  const fullTop = insets.top + 6 + sizes.touch + 10;
  const midTop = sheetMidTop(H);
  // The bar is a capsule, like iOS's floating tab bar. It sits as far in from the sides and
  // bottom as it takes for its round ends to run parallel to the screen corners
  // (screen radius minus half its height), so it never looks pinched into the corner.
  const barBottom = corners.capsuleInset(BAR_H);
  const BAR_SIDE = barBottom;
  const barTop = H - barBottom - BAR_H;

  const p = useSharedValue(settled ? 1 : 0);
  const pos = useSharedValue(POS[start]);
  const dragTop = useSharedValue(0);
  const [at, setAt] = useState<Detent>(start);
  const [moving, setMoving] = useState(false);
  // The map is heavy to start, so it comes in once the card has landed (a plain backdrop
  // fades in under the morph instead); starting both at once made the morph stutter.
  const [mapOn, setMapOn] = useState(!!settled);
  useEffect(() => {
    const id = setTimeout(() => setMapOn(true), 700); // in case the spring is interrupted
    return () => clearTimeout(id);
  }, []);

  // Where the card starts: on the row you tapped, or just below the screen.
  const origin0 = from
    ? { top: from.y, left: from.x, width: from.width, height: from.height, radius: 14 }
    : { top: H + 24, left: M, width: W - 2 * M, height: H - cardBottom - midTop, radius: R };

  const topOf = (v: number) => {
    'worklet';
    return v >= 1 ? midTop + (fullTop - midTop) * (v - 1) : barTop + (midTop - barTop) * v;
  };
  const posOf = (top: number) => {
    'worklet';
    if (top <= midTop) return Math.min(2.04, 1 + (midTop - top) / (midTop - fullTop));
    return Math.max(-0.04, 1 - (top - midTop) / (barTop - midTop));
  };
  // The card's frame at a height.
  const frameAt = (v: number) => {
    'worklet';
    if (v >= 1) {
      const top = topOf(v);
      return { top, left: M, width: W - 2 * M, height: H - cardBottom - top, radius: R };
    }
    const k = Math.max(0, v);
    const mix = (a: number, b: number) => a + (b - a) * k;
    return {
      top: mix(barTop, midTop),
      left: mix(BAR_SIDE, M),
      width: mix(W - 2 * BAR_SIDE, W - 2 * M),
      height: mix(BAR_H, H - cardBottom - midTop),
      radius: mix(BAR_H / 2, R),
    };
  };

  const landed = (d: Detent) => {
    setAt(d);
    setMoving(false);
  };
  const goTo = (d: Detent, soft = false) => {
    'worklet';
    pos.value = reduced
      ? withTiming(POS[d], { duration: 160 }, (ok) => {
          if (ok) runOnJS(landed)(d);
        })
      : withSpring(POS[d], soft ? SHIFT : SNAP, (ok) => {
          if (ok) runOnJS(landed)(d);
        });
  };
  const moveTo = (d: Detent, soft = false) => {
    setMoving(true);
    goTo(d, soft);
  };

  // Open: grow out of the row. Close: fold back into it.
  useEffect(() => {
    if (closing) {
      const done = (ok?: boolean) => {
        'worklet';
        if (ok) runOnJS(onClosed)();
      };
      setMoving(true);
      p.value = reduced ? withTiming(0, { duration: 140 }, done) : withSpring(0, CLOSE, done);
    } else if (!settled) {
      const opened = (ok?: boolean) => {
        'worklet';
        if (ok) runOnJS(setMapOn)(true);
      };
      p.value = reduced ? withTiming(1, { duration: 140 }, opened) : withSpring(1, OPEN, opened);
    }
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (want) moveTo(want.to, true);
  }, [want?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag the card (by its top or the bar) between the three heights.
  const startMove = () => setMoving(true);
  const panConfig = {
    enabled: !closing,
    activeOffsetY: [-8, 8] as [number, number],
    failOffsetX: [-20, 20] as [number, number],
    onActivate: () => {
      'worklet';
      cancelAnimation(pos);
      dragTop.value = topOf(pos.value);
      runOnJS(startMove)();
    },
    onUpdate: (e: { translationY: number }) => {
      'worklet';
      pos.value = posOf(dragTop.value + e.translationY);
    },
    onDeactivate: (e: { velocityY: number }) => {
      'worklet';
      const v = pos.value;
      let i: number;
      if (e.velocityY > FLICK) i = v > 1.02 ? 1 : 0;
      else if (e.velocityY < -FLICK) i = v < 0.98 ? 1 : 2;
      else {
        // The nearest height, by where the top edge is.
        const top = topOf(v);
        const d = [barTop, midTop, fullTop].map((x) => Math.abs(x - top));
        i = d.indexOf(Math.min(d[0], d[1], d[2]));
      }
      goTo(DETENTS[i]);
    },
  };
  const panTop = usePanGesture(panConfig);
  const panBar = usePanGesture(panConfig);

  // Pull the details down past their top (iOS rubber band) to drop one height.
  // Like Find My: the header and the buttons stay put and the details slide under them, cut at a
  // hairline that only shows while something is actually tucked under it. No solid bar.
  const under = useSharedValue(0); // how far the details have scrolled under the header
  const below = useSharedValue(0); // how much is still hidden under the buttons
  const track = (e: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } }) => {
    'worklet';
    under.value = e.contentOffset.y;
    below.value = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y;
  };
  const onScroll = useAnimatedScrollHandler({
    onScroll: track,
    onMomentumEnd: track,
    onEndDrag: (e) => {
      track(e);
      if (e.contentOffset.y < -70) {
        runOnJS(startMove)();
        goTo(pos.value > 1.5 ? 'mid' : 'mini');
      }
    },
  });

  const solid = useAnimatedStyle(() => ({ opacity: clamp01((pos.value - 1.25) / 0.7) }));
  const headLine = useAnimatedStyle(() => ({ opacity: clamp01(under.value / 8) }));
  const footLine = useAnimatedStyle(() => ({ opacity: clamp01(below.value / 8) }));

  const cardStyle = useAnimatedStyle(() => {
    const g = frameAt(pos.value);
    const k = p.value;
    const mix = (a: number, b: number) => a + (b - a) * k;
    return {
      top: mix(origin0.top, g.top),
      left: mix(origin0.left, g.left),
      width: mix(origin0.width, g.width),
      height: mix(origin0.height, g.height),
      borderRadius: mix(origin0.radius, g.radius),
    };
  });
  const clipStyle = useAnimatedStyle(() => {
    const g = frameAt(pos.value);
    return { borderRadius: origin0.radius + (g.radius - origin0.radius) * p.value };
  });
  // Contents fade in late in the morph, and swap between the card's and the bar's by height.
  // (One opacity per view: two animated styles on one view would fight over it.)
  // The details are laid out at the card's real size (its height, not the morph's), so while
  // the card grows they don't re-flow every frame; the card's rounded clip just reveals them.
  const fullStyle = useAnimatedStyle(() => {
    const g = frameAt(pos.value);
    return {
      width: g.width,
      height: g.height,
      opacity: clamp01((p.value - 0.35) / 0.45) * clamp01((pos.value - 0.35) / 0.5),
    };
  });
  const barStyle = useAnimatedStyle(() => ({
    opacity: clamp01((p.value - 0.35) / 0.45) * clamp01((0.4 - pos.value) / 0.4),
  }));
  // The tapped row's own porcelain covers the card at first, so the first frame matches it.
  const skin = useAnimatedStyle(() => ({ opacity: 1 - clamp01(p.value / 0.5) }));
  const mapStyle = useAnimatedStyle(() => ({ opacity: clamp01(p.value / 0.6) }));
  const topStyle = useAnimatedStyle(() => ({ opacity: clamp01((p.value - 0.5) / 0.5) }));

  // The main button keeps the same gap below it as beside it (the body's 18), so its capsule
  // ends sit concentric inside the card's bottom corners too.
  const footerBottom = 18;
  // Apple's Liquid Glass on the card and the bar whenever they rest. While the card moves or
  // changes size (a drag, a step asking for room, the open and close morph) it's a frosted
  // stand-in instead: native glass turns into a grey slab while its size animates.
  const glass = LIQUID_GLASS && mapOn && !moving && !closing;

  // Steps: the new one slides in a little from the side it comes from (deeper: from the end,
  // back: from the start) while fading up, and the list starts at the top again.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const stepKey = step?.key ?? 'details';
  const depth = step?.depth ?? 0;
  const prev = useRef({ key: stepKey, depth, changed: false, deeper: true });
  if (prev.current.key !== stepKey) {
    prev.current = { key: stepKey, depth, changed: true, deeper: depth >= prev.current.depth };
  }
  const fromEnd = prev.current.deeper !== rtl; // in Arabic "the end" is the left
  const dx = fromEnd ? STEP_SLIDE : -STEP_SLIDE;
  const enter =
    reduced || !prev.current.changed
      ? undefined
      : () => {
          'worklet';
          return {
            initialValues: { opacity: 0, transform: [{ translateX: dx }] },
            animations: {
              opacity: withTiming(1, { duration: STEP_MS * 0.8, easing: STEP_EASE }),
              transform: [{ translateX: withTiming(0, { duration: STEP_MS, easing: STEP_EASE }) }],
            },
          };
        };
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [stepKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const time = shortTime(new Date(departsAt));
  const align = { textAlign: rtl ? ('right' as const) : ('left' as const) };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={closing ? 'none' : 'box-none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.sunken }, mapStyle]}>
        {mapOn && map ? (
          <Animated.View key="custom" style={StyleSheet.absoluteFill} entering={reduced ? undefined : FadeIn.duration(240)}>
            {map}
          </Animated.View>
        ) : mapOn ? (
          <Animated.View key="route" style={StyleSheet.absoluteFill} entering={reduced || settled ? undefined : FadeIn.duration(320)}>
            <RouteMap
              start={pickup ?? undefined}
              origin={origin}
              destination={destination}
              height={H}
              topInset={insets.top + 60}
              bottomInset={H - midTop}
              interactive
            />
          </Animated.View>
        ) : null}
      </Animated.View>

      <Animated.View style={[styles.top, { top: insets.top + 6, direction }, topStyle]} pointerEvents="box-none">
        {/* These fade in with the open morph and out on close: frosted until they're fully there. */}
        <GlassButton icon="x" label={t('closeTrip')} onPress={onRequestClose} native={mapOn && !closing} />
        {onShare ? <GlassButton icon="shareNetwork" label={t('shareTrip')} onPress={onShare} native={mapOn && !closing} /> : <View />}
      </Animated.View>

      <Animated.View style={[styles.card, glass && styles.cardLiquid, cardStyle]}>
        {/* Resting: Apple's Liquid Glass, outside the clip below and with no shadow on its
            parent, because a clipped or shadowed parent makes UIKit draw a plain blur instead.
            It carries its own corners: the card's, or the bar's capsule. */}
        {glass ? <Glass radius={at === 'mini' ? BAR_H / 2 : R} interactive={at === 'mini'} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, styles.clip, glass && styles.clipLiquid, clipStyle]}>
          {/* Moving: the frosted stand-in, the same look as everywhere else. It stays glass at
              every height, all the way to full: never a solid sheet. */}
          {glass ? null : <Glass native={false} />}
          {/* Like Find My: glass at the middle height, then a smooth fade to solid porcelain as
              the card rises to full, so long details read like a page. It follows the finger. */}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }, solid]} pointerEvents="none" />
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }, skin]} pointerEvents="none" />

          {/* Middle and full: grab, header, scrolling details, pinned buttons. */}
          <Animated.View style={[styles.full, fullStyle]} pointerEvents={at === 'mini' && !moving ? 'none' : 'box-none'}>
            <GestureDetector gesture={panTop}>
              <View style={[styles.head, { direction }]}>
                <Pressable
                  accessibilityRole="adjustable"
                  accessibilityLabel={t('sheetHandle')}
                  onPress={() => moveTo(at === 'full' ? 'mid' : 'full')}
                  hitSlop={8}
                  style={styles.grabZone}
                >
                  <View style={styles.grab} />
                </Pressable>
                <Animated.View key={stepKey} entering={enter}>
                  {header}
                </Animated.View>
              </View>
            </GestureDetector>
            <View style={{ flex: 1 }}>
              <Animated.ScrollView
                ref={scrollRef}
                onScroll={onScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={[styles.body, { direction }]}
              >
                <Animated.View key={stepKey} entering={enter} style={{ gap: space.md }}>
                  {body}
                </Animated.View>
              </Animated.ScrollView>
              <Animated.View pointerEvents="none" style={[styles.line, { top: 0 }, headLine]} />
            </View>
            {footer ? (
              <View style={[styles.footer, { paddingBottom: footerBottom, direction }]}>
                <Animated.View pointerEvents="none" style={[styles.line, { top: 0 }, footLine]} />
                <Animated.View key={stepKey} entering={enter} style={{ gap: space.sm }}>
                  {footer}
                </Animated.View>
              </View>
            ) : (
              <View style={{ height: space.md }} />
            )}
          </Animated.View>

          {/* The bar: time, where things stand, and the one button that matters now. */}
          <GestureDetector gesture={panBar}>
            <Animated.View
              style={[styles.bar, { direction }, barStyle]}
              pointerEvents={at === 'mini' && !moving ? 'auto' : 'none'}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${time}, ${mini.sub}`}
                accessibilityHint={t('sheetHandle')}
                onPress={() => {
                  tapFeel();
                  moveTo('mid');
                }}
                style={styles.barText}
              >
                <Text style={[styles.barTime, align]}>{time}</Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.barSub,
                    { fontFamily: f.regular },
                    align,
                    mini.tone === 'clay' && { color: colors.clay, fontFamily: f.medium },
                    mini.tone === 'ok' && { color: colors.statusOpen, fontFamily: f.medium },
                  ]}
                >
                  {mini.sub}
                </Text>
              </Pressable>
              {mini.action ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={mini.action.onPress}
                  disabled={mini.action.loading}
                  style={({ pressed }) => [styles.barButton, mini.action?.secondary && styles.barButtonQuiet, pressed && { opacity: 0.7 }]}
                >
                  {mini.action.loading ? (
                    <ActivityIndicator size="small" color={mini.action.secondary ? colors.ink : colors.onInk} />
                  ) : (
                    <Text style={[styles.barButtonText, { fontFamily: f.medium }, mini.action.secondary && { color: colors.ink }]}>
                      {mini.action.label}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** A step inside the card (Request, Rate, the driver): back arrow and a title. */
export function StepHeader({ title, kicker, onBack }: { title: string; kicker?: string; onBack: () => void }) {
  const { t } = useT();
  const { f, rtl } = useFont();
  const align = { textAlign: rtl ? ('right' as const) : ('left' as const) };
  return (
    <View style={styles.step}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={onBack} hitSlop={8} style={styles.stepBack}>
        <Icon name={rtl ? 'caretRight' : 'caretLeft'} size={18} />
      </Pressable>
      <View style={{ flex: 1 }}>
        {kicker ? <Text style={[styles.kicker, { fontFamily: f.regular }, align]}>{kicker}</Text> : null}
        <Text style={[styles.stepTitle, { fontFamily: f.bold }, align]}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.screen, right: space.screen, flexDirection: 'row', justifyContent: 'space-between' },
  card: {
    position: 'absolute',
    ...shadows.glass,
  },
  clip: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  // Real glass draws its own edge and shadow.
  cardLiquid: { shadowOpacity: 0, elevation: 0 },
  clipLiquid: { borderWidth: 0 },
  full: { position: 'absolute', top: 0, left: 0 },
  head: { paddingHorizontal: 18, paddingBottom: space.sm },
  grabZone: { alignSelf: 'center', paddingTop: 8, paddingBottom: 10, paddingHorizontal: 24 },
  grab: { width: 36, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong },
  body: { paddingHorizontal: 18, paddingBottom: space.md, gap: space.md },
  footer: { paddingHorizontal: 18, paddingTop: space.sm, gap: space.sm },
  line: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(23,25,28,0.12)' },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingStart: 20,
    paddingEnd: 10,
  },
  barText: { flex: 1, justifyContent: 'center', height: '100%' },
  barTime: { fontFamily: fonts.en.bold, fontSize: 18, lineHeight: 22, color: colors.ink },
  barSub: { fontSize: 12, lineHeight: 16, color: colors.inkSecondary },
  barButton: {
    height: 44,
    minWidth: 72,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barButtonQuiet: { backgroundColor: 'rgba(23,25,28,0.07)' },
  barButtonText: { fontSize: 14, color: colors.onInk },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(23,25,28,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { fontSize: 12, lineHeight: 16, color: colors.inkSecondary },
  stepTitle: { fontSize: 19, lineHeight: 26, color: colors.ink },
});
