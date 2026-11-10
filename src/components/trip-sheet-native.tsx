// The trip card on Apple's own sheet (iOS 26+, Nov 10), so it behaves exactly like Find My:
// real Liquid Glass while you drag it, at every height, and a smooth change to a solid page
// when it reaches the top. Our own card (trip-sheet.tsx) can't do that: Apple's glass can only
// follow a resize from the inside, so ours swaps in a frosted copy while it moves.
//
// The map is the bottom of a small native stack and the card is a form sheet on top of it,
// with three stops: the bar (time, status, one button), the middle, and full. The map stays
// usable at every stop. Older iOS and Android keep the custom card.
//
// What changes compared with the custom card: it rises from below instead of growing out of
// the row you tapped, and Apple's sheet draws its own glass, grabber and corners.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenStack, ScreenStackItem } from 'react-native-screens';

import { DialogLayer } from '@/components/dialog-host';
import { RouteMap } from '@/components/route-map';
import { Glass } from '@/components/glass';
import type { TripSheetProps, Detent } from '@/components/trip-sheet';
import { GlassButton, useFont } from '@/components/ui';
import { shortTime } from '@/lib/format';
import { tapFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { useScreenCorners } from '@/theme/screen-corners';
import { colors, space } from '@/theme/tokens';

const ORDER: Detent[] = ['mini', 'mid', 'full'];
// The same springs as the custom card's open and close.
const OPEN = { damping: 24, stiffness: 200, mass: 1 };
const CLOSE = { damping: 30, stiffness: 280, mass: 1, overshootClamping: true };
const BAR_H = 64;

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};

export function NativeTripSheet({
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
}: TripSheetProps) {
  const { t } = useT();
  const { f, rtl, direction } = useFont();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const reduced = useReducedMotion();

  const { width: W } = useWindowDimensions();
  const corners = useScreenCorners();

  // The three stops. Apple measures them as a share of the tallest a sheet can be (the screen
  // minus the status bar and a small gap), so the heights in points come out where we want.
  const Hmax = H - insets.top - 10;
  const midTop = Math.round(H * 0.44); // same as sheetMidTop() in trip-sheet.tsx
  const heights = [BAR_H + 30 + Math.max(insets.bottom, 12), H - midTop, Hmax];
  const stops = heights.map((h) => Math.min(1, h / Hmax));
  // Where the sheet sits at a stop (iOS 26 sheets float a few points in, with the phone's corners).
  const frameOf = (d: Detent) => {
    const h = heights[ORDER.indexOf(d)];
    return { x: corners.inset, y: H - corners.inset - h, width: W - 2 * corners.inset, height: h };
  };

  // Hybrid open and close: our own card grows out of the row you tapped and lands exactly where
  // Apple's sheet will sit; then the native sheet takes over with no slide of its own. Closing
  // is the reverse. Opened from nowhere in particular, Apple's sheet just slides up.
  const morphs = !!from && !settled;
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>(morphs ? 'opening' : 'open');
  const [handoff, setHandoff] = useState(morphs);
  const k = useSharedValue(morphs ? 0 : 1);
  const target = useSharedValue(frameOf(start));
  const origin0 = from ?? frameOf(start);
  useEffect(() => {
    if (!morphs) return;
    const done = (ok?: boolean) => {
      'worklet';
      if (ok) runOnJS(setPhase)('open');
    };
    k.value = reduced ? withTiming(1, { duration: 160 }, done) : withSpring(1, OPEN, done);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Once the native sheet is up, let our stand-in go a beat later so there's no flash between.
  useEffect(() => {
    if (phase !== 'open' || !handoff) return;
    const id = setTimeout(() => setHandoff(false), 120);
    return () => clearTimeout(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  const morphStyle = useAnimatedStyle(() => {
    const g = target.value;
    const v = k.value;
    const mix = (a: number, b: number) => a + (b - a) * v;
    return {
      left: mix(origin0.x, g.x),
      top: mix(origin0.y, g.y),
      width: mix(origin0.width, g.width),
      height: mix(origin0.height, g.height),
      borderRadius: mix(14, corners.card),
    };
  });
  // The tapped row's own porcelain covers the card at first, so the first frame matches it.
  const skin = useAnimatedStyle(() => ({ opacity: 1 - clamp01(k.value / 0.5) }));

  const [at, setAt] = useState<Detent>(start);
  // A step that needs room (Request opening the bar): Apple's sheet can only be sent to a stop
  // by offering that one stop for a moment, then all three again.
  const [only, setOnly] = useState<number | null>(null);
  useEffect(() => {
    if (!want) return;
    const i = ORDER.indexOf(want.to);
    setOnly(i);
    setAt(want.to);
    const id = setTimeout(() => setOnly(null), 450);
    return () => clearTimeout(id);
  }, [want?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing: with a row to go back to, our card takes over from wherever the sheet rests and
  // folds into it; otherwise Apple's sheet slides away. Then the layer goes.
  useEffect(() => {
    if (!closing) return;
    if (!from) {
      const id = setTimeout(onClosed, 380);
      return () => clearTimeout(id);
    }
    target.value = frameOf(at);
    setHandoff(true);
    setPhase('closing');
    const done = (ok?: boolean) => {
      'worklet';
      if (ok) runOnJS(onClosed)();
    };
    k.value = reduced ? withTiming(0, { duration: 140 }, done) : withSpring(0, CLOSE, done);
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find My's scroll: header and buttons stay put; the details slide under them, cut at a
  // hairline that only shows while something is tucked under.
  const under = useSharedValue(0);
  const below = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      under.value = e.contentOffset.y;
      below.value = e.contentSize.height - e.layoutMeasurement.height - e.contentOffset.y;
    },
  });
  const headLine = useAnimatedStyle(() => ({ opacity: clamp01(under.value / 8) }));
  const footLine = useAnimatedStyle(() => ({ opacity: clamp01(below.value / 8) }));

  const stepKey = step?.key ?? 'details';
  const scrollRef = useRef<Animated.ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [stepKey]);
  const enter = reduced ? undefined : FadeIn.duration(220);

  const time = shortTime(new Date(departsAt));
  const align = { textAlign: rtl ? ('right' as const) : ('left' as const) };

  const card = (
    <View style={[styles.sheet, { direction }]}>
      {at === 'mini' ? (
        // The smallest stop: the bar. Tap it to open the card to the middle.
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${time}, ${mini.sub}`}
            onPress={() => {
              tapFeel();
              setOnly(1);
              setAt('mid');
              setTimeout(() => setOnly(null), 450);
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
        </View>
      ) : (
        <>
          <View style={styles.head}>
            <Animated.View key={stepKey} entering={enter}>
              {header}
            </Animated.View>
          </View>
          <View style={{ flex: 1 }}>
            <Animated.ScrollView
              ref={scrollRef}
              onScroll={onScroll}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
              contentContainerStyle={styles.body}
            >
              <Animated.View key={stepKey} entering={enter} style={{ gap: space.md }}>
                {body}
              </Animated.View>
            </Animated.ScrollView>
            <Animated.View pointerEvents="none" style={[styles.line, { top: 0 }, headLine]} />
          </View>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 18) }]}>
              <Animated.View pointerEvents="none" style={[styles.line, { top: 0 }, footLine]} />
              <Animated.View key={stepKey} entering={enter} style={{ gap: space.sm }}>
                {footer}
              </Animated.View>
            </View>
          ) : (
            <View style={{ height: Math.max(insets.bottom, space.md) }} />
          )}
        </>
      )}
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={phase === 'open' ? 'box-none' : 'none'}>
    <ScreenStack style={StyleSheet.absoluteFill}>
      <ScreenStackItem screenId="trip-map" headerConfig={{ hidden: true }} style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.sunken }]}
          entering={reduced ? undefined : FadeIn.duration(260)}
        >
          {/* The map is heavy to start, so it waits for the opening to land: starting both at
              once is what makes an animation stutter. */}
          {phase === 'opening' ? null : map ?? (
            <RouteMap
              start={pickup ?? undefined}
              origin={origin}
              destination={destination}
              height={H}
              topInset={insets.top + 60}
              bottomInset={H - midTop}
              interactive
            />
          )}
        </Animated.View>
        <View style={[styles.top, { top: insets.top + 6, direction }]} pointerEvents="box-none">
          <GlassButton icon="x" label={t('closeTrip')} onPress={onRequestClose} />
          {onShare ? <GlassButton icon="shareNetwork" label={t('shareTrip')} onPress={onShare} /> : <View />}
        </View>
      </ScreenStackItem>
      {phase !== 'open' || (closing && !from) ? null : (
        <ScreenStackItem
          screenId="trip-card"
          stackPresentation="formSheet"
          // After our own opening, the sheet appears in place (and leaves the same way).
          stackAnimation={from ? 'none' : 'default'}
          headerConfig={{ hidden: true }}
          sheetAllowedDetents={only === null ? stops : [stops[only]]}
          sheetInitialDetentIndex={ORDER.indexOf(start)}
          // The map stays usable behind the card at every stop.
          sheetLargestUndimmedDetentIndex="last"
          sheetGrabberVisible
          sheetExpandsWhenScrolledToEdge
          // It only closes with the X, like Find My: a swipe down stops at the bar.
          preventNativeDismiss
          gestureEnabled
          // No background of our own, so Apple's glass shows (and turns solid at the top).
          contentStyle={{ backgroundColor: 'transparent' }}
          onSheetDetentChanged={(e) => {
            if (only !== null) return;
            const d = ORDER[e.nativeEvent.index];
            if (d) setAt(d);
          }}
        >
          {/* The sheet is its own native screen: it needs its own gesture root, and pop-ups
              must open from it (a pop-up from the layer underneath can't show over it). */}
          <GestureHandlerRootView style={{ flex: 1 }}>
            {/* After our own opening, the content fades in on the glass, so the handoff reads as
                one motion. */}
            <Animated.View style={{ flex: 1 }} entering={from && !reduced ? FadeIn.duration(180) : undefined}>
              {card}
            </Animated.View>
            <DialogLayer />
          </GestureHandlerRootView>
        </ScreenStackItem>
      )}
    </ScreenStack>
    {handoff ? (
      <Animated.View pointerEvents="none" style={[styles.morph, morphStyle]}>
        <Glass native={false} />
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }, skin]} />
      </Animated.View>
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  morph: { position: 'absolute', overflow: 'hidden' },
  top: { position: 'absolute', left: space.screen, right: space.screen, flexDirection: 'row', justifyContent: 'space-between' },
  sheet: { flex: 1, paddingTop: 18 },
  head: { paddingHorizontal: 18, paddingBottom: space.sm },
  body: { paddingHorizontal: 18, paddingBottom: space.md, gap: space.md },
  footer: { paddingHorizontal: 18, paddingTop: space.sm, gap: space.sm },
  line: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(23,25,28,0.12)' },
  bar: { height: BAR_H, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 18 },
  barText: { flex: 1, gap: 2 },
  barTime: { fontSize: 20, lineHeight: 24, color: colors.ink },
  barSub: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  barButton: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  barButtonQuiet: { backgroundColor: 'rgba(23,25,28,0.06)' },
  barButtonText: { fontSize: 15, color: colors.onInk },
});
