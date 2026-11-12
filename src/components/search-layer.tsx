// "Where to?" grows into the search, in place (design C1a; at the bottom since Nov 10, option D).
//
// The grey bar on Home lifts off, glides DOWN to the bottom of the screen and becomes a glass
// capsule with the route, in the tab bar's place. The day row (pinned at the top) and the
// trips fill the page above it and scroll under it. Tapping From or To grows the capsule
// upward into two fields that ride on top of the keyboard. × or a swipe down folds it back
// into Home's bar.
//
// Rebuilt Nov 12 (option A, "always ready") because the motion kept stuttering. The rules:
// 1. Built ahead, woken on the tap. This layer is mounted once in the root layout a moment
//    after sign-in and sleeps (invisible, untouchable) above every screen. Tapping Home's bar
//    only sets a few numbers on the UI thread; nothing is created or laid out on the tap.
//    (It used to be a popup Modal created on the tap, and a hidden Modal throws its contents
//    away, so it could never be kept ready.)
// 2. One keyboard tracker: react-native-keyboard-controller reads where the keyboard really
//    is, frame by frame, on the UI thread. (The old code mixed four sources and corrected
//    iOS 26's short reported height by guesswork; when they disagreed, the bar nudged.)
// 3. Nothing re-renders while something moves. The search's state lives here, not in Home,
//    and no React state is set in the middle of a glide.
// 4. Moving things slide and fade. The bar and the From/To card travel with transforms. The
//    only size that animates is the card's plain background, which has nothing inside to
//    lay out.
//
// Picking towns (Nov 12): both fields are real text fields that stay on screen, so choosing
// From moves the caret straight to To with the keyboard staying up (the From field used to be
// thrown away, which dropped the keyboard and folded the whole card). The card only folds
// when you pick To, tap back, or swipe it down. Dragging the list puts the keyboard away but
// keeps the card open, so you can browse the towns; tap a field to type again.
//
// Glass is only on the bar, the one thing floating over content that scrolls under it.
// While it moves or changes size it is a plain porcelain fill (Liquid Glass turns into a flat
// grey block if it moves or is resized every frame); once it has settled at the bottom, real
// Liquid Glass (iOS 26) takes over.

import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import { memo, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputInstance,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useKeyboardController, useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { PlaceResults, PLACE_FIELDS_H, topPick, usePlaceSearch, type End, type PlaceSearch } from '@/components/place-search';
import { TripDetails } from '@/components/trip-details';
import { AlertMe, DayChips, SearchResults, useTripSearch, type SearchState } from '@/components/trip-search';
import { inputAlign, useFont } from '@/components/ui';
import { selectFeel, tapFeel } from '@/lib/haptics';
import { placeName } from '@/lib/places';
import { recentPlaces, rememberPlace } from '@/lib/recent-places';
import {
  closeSearch,
  currentSearch,
  searchClosed,
  searchCoversBar,
  subscribeSearch,
  usualRoute,
  type SearchRequest,
} from '@/lib/search-layer';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import type { Rect } from '@/lib/trip-layer';
import { useScreenCorners } from '@/theme/screen-corners';
import { inkWash } from '@/theme/palettes';
import { makeStyles, useTheme } from '@/theme/theme';
import { motion, space } from '@/theme/tokens';

// The bar is one calm line: close, the route, swap. 62pt tall, like the tab bar whose place it takes.
const PAD = 9;
const ROW = 44;
const HEAD_H = PAD + ROW + PAD;
// Concentric with what's inside: the round buttons and capsule fields (radius 22) sit 9pt in.
const RADIUS = ROW / 2 + PAD;
// Gap between the card and the top of the keyboard.
const KB_GAP = 8;
// Room kept at the end of the town list for the tallest keyboard (with its suggestion strip),
// so the last towns can scroll up above the card. A fixed number: measuring it as the
// keyboard moved re-laid out the list on every frame.
const KB_ROOM = 360;
// Room for the docked "Alert me" (a 56pt capsule and its gap) at the end of the trips.
const ALERT_ROOM = 56 + 12;
// Grown for place search: the head row, then the two From/To fields.
const GAP = 10;
const GROW = GAP + PLACE_FIELDS_H + 4;
const CARD_H = HEAD_H + GROW;
// Grow and shrink on the iOS sheet curve: quick to start, long soft landing, no bounce.
const GROW_MS = 380;
const GROW_EASE = Easing.bezier(0.32, 0.72, 0, 1);
// The layer is built this long after sign-in, once Home has drawn and loaded.
const BUILD_AFTER_MS = 1200;
// Critically damped: it lands without overshooting (the bounce looked wobbly).
const OPEN = { damping: 28, stiffness: 200, mass: 1 };
const CLOSE = { damping: 30, stiffness: 260, mass: 1, overshootClamping: true };
// Swipe down to close: past this far, or flicked fast (same feel as the app's sheets).
const PULL_CLOSE = 90;
// Swipe the grown card down this far (or flick it) to fold it back to the bar.
const PULL_COLLAPSE = 36;
// How far the list slides down into the bar as it folds away.
const TUCK = 220;
// The pinned day row before it has measured itself: 8 above, the 44pt calendar circle, 8 below.
const DAYS_ROW_H = space.sm + 44 + space.sm;
// How tall the soft fades are where the towns meet the status bar and the card.
const FADE_H = 28;
const LIQUID_GLASS = isLiquidGlassAvailable();

/** Mounted once in the root layout. Builds the search a moment after sign-in and keeps it. */
export function SearchLayerHost() {
  const req = useSyncExternalStore(subscribeSearch, currentSearch, currentSearch);
  const pathname = usePathname();
  const [built, setBuilt] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setBuilt(true), BUILD_AFTER_MS);
    return () => clearTimeout(id);
  }, []);
  // Tapped before it was built (a very quick first tap): build it now.
  useEffect(() => {
    if (req) setBuilt(true);
  }, [req]);
  // A page opened from inside the search (the ID check from a trip card): the search steps
  // aside while it's up, and is back as you left it when you return.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  useEffect(() => {
    setOpenedAt(req ? pathname : null);
  }, [req?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const parked = !!req && openedAt !== null && pathname !== openedAt;
  if (!built) return null;
  return <SearchLayer req={req} parked={parked} />;
}

const SearchLayer = memo(function SearchLayer({ req, parked }: { req: SearchRequest | null; parked: boolean }) {
  const { scheme: themeScheme, c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f, rtl, direction } = useFont();
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const corners = useScreenCorners();
  const s = useTripSearch();
  const places = usePlaceSearch();
  const picking = places.end;
  const open = !!req;
  const closing = !!req?.closing;
  const live = open && !closing && !parked;

  // Start from your usual route, until you change it in the search.
  const usual = useSyncExternalStore(subscribeSearch, usualRoute, usualRoute);
  const { setOrigin, setDestination } = s;
  useEffect(() => {
    if (usual && !open) {
      setOrigin(usual.origin);
      setDestination(usual.destination);
    }
  }, [usual]); // eslint-disable-line react-hooks/exhaustive-deps

  // The keyboard, where it really is, frame by frame on the UI thread (negative = up).
  const keyboard = useReanimatedKeyboardAnimation();
  // On Android the keyboard library takes over how screens make room for the keyboard, so it
  // is only switched on while the search is open; every other screen keeps the system's way.
  const kbController = useKeyboardController();
  useEffect(() => {
    if (Platform.OS === 'android') kbController.setEnabled(live);
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const side = corners.capsuleInset(HEAD_H);
  const bottomGap = side;

  // A trip opened from the results grows out of its row, right here over the search.
  const [trip, setTrip] = useState<{ id: string; from: Rect | null; key: number; closing: boolean; seen: boolean } | null>(null);
  const tripBack = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (parked) setTrip((v) => (v ? { ...v, seen: true } : v));
  }, [parked]);
  const openTrip = (id: string, at?: Rect | null) => {
    tapFeel();
    setTrip((v) => ({ id, from: at ?? null, key: (v?.key ?? 0) + 1, closing: false, seen: false }));
  };

  // 0 = Home's bar, 1 = settled at the bottom. Drives the whole open and close.
  const p = useSharedValue(0);
  // 1 while the layer is showing at all (from the tap until it has folded back).
  const shown = useSharedValue(0);
  const hiddenForPage = useSharedValue(0);
  useEffect(() => {
    hiddenForPage.value = parked ? 1 : 0;
  }, [parked]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where Home's bar was, so the first frame sits exactly on it.
  const fromX = useSharedValue(0);
  const fromY = useSharedValue(0);
  const fromW = useSharedValue(1);
  const fromH = useSharedValue(HEAD_H);
  // 0 = the one-line bar, 1 = grown into the From/To fields.
  const grow = useSharedValue(0);
  // Swipe down to close. `drag` = the bar pulled by a finger; `pull` = the list pulled past its top.
  const drag = useSharedValue(0);
  const pull = useSharedValue(0);
  const leaving = useSharedValue(0);
  const cardDrag = useSharedValue(0);
  // The size the bar last came to rest at (true = grown): native glass waits for it to land.
  const [restGrown, setRestGrown] = useState(false);
  const [settled, setSettled] = useState(false);
  const [daysH, setDaysH] = useState(0);
  const listRef = useAnimatedRef<Animated.ScrollView>();
  const inputs = { origin: useRef<TextInputInstance>(null), destination: useRef<TextInputInstance>(null) };

  // Open: the numbers are set and the spring starts, in the same moment. Everything it moves
  // is already built.
  useEffect(() => {
    if (!req || req.closing) return;
    const { x, y, width: w, height: h } = req.from;
    fromX.value = x;
    fromY.value = y;
    fromW.value = w;
    fromH.value = h;
    leaving.value = 0;
    drag.value = 0;
    pull.value = 0;
    cardDrag.value = 0;
    p.value = 0;
    shown.value = 1;
    searchCoversBar.value = 1;
    const arrived = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(setSettled)(true);
    };
    p.value = reduced ? withTiming(1, { duration: 120 }, arrived) : withSpring(1, OPEN, arrived);
  }, [req?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close: the list tucks down into the bar while the bar glides back up into Home's.
  useEffect(() => {
    if (!closing) return;
    setSettled(false);
    leaving.value = 1;
    const done = (finished?: boolean) => {
      'worklet';
      if (!finished) return;
      // In the same frame: this layer goes and Home's own bar is back.
      shown.value = 0;
      searchCoversBar.value = 0;
      runOnJS(folded)();
    };
    p.value = reduced ? withTiming(0, { duration: 120 }, done) : withSpring(0, CLOSE, done);
    drag.value = reduced ? 0 : withSpring(0, CLOSE);
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps
  function folded() {
    setTrip(null);
    places.close();
    listRef.current?.scrollTo({ y: 0, animated: false });
    searchClosed();
  }

  useEffect(() => {
    const target = !!picking;
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(setRestGrown)(target);
    };
    grow.value = withTiming(target ? 1 : 0, reduced ? { duration: 120 } : { duration: GROW_MS, easing: GROW_EASE }, done);
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, [picking]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android back: the trip card, then the town fields, then the search.
  useEffect(() => {
    if (!live) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (trip) tripBack.current?.();
      else if (places.end) collapse();
      else requestClose();
      return true;
    });
    return () => sub.remove();
  });

  function requestClose() {
    if (!live) return;
    tapFeel();
    Keyboard.dismiss();
    closeSearch();
  }
  /** From/To back to the one-line bar, keyboard away. */
  function collapse() {
    tapFeel();
    places.close();
    Keyboard.dismiss();
  }
  /** Tap on From or To: the card grows and that field takes the caret, in one go. */
  function startPicking(end: End) {
    tapFeel();
    // The field's onFocus opens that end, so the card and the keyboard start together.
    inputs[end].current?.focus();
  }
  /** A town was chosen. From moves straight on to To (keyboard stays up); To folds the card. */
  function pickTown(id: City) {
    rememberPlace(id);
    if (places.end === 'origin') {
      s.setOrigin(id);
      places.open('destination');
      inputs.destination.current?.focus();
    } else {
      s.setDestination(id);
      places.close();
      Keyboard.dismiss();
    }
  }
  /** The keyboard's Return key picks the lit (first) town. */
  function pickTop() {
    const id = topPick(places, places.end === 'origin' ? s.destination : s.origin);
    if (id) {
      selectFeel();
      pickTown(id);
    }
  }
  const pulledDown = () => (places.end ? collapse() : requestClose());

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      pull.value = y < 0 ? -y : 0;
    },
    onEndDrag: (e) => {
      const fast = (e.velocity?.y ?? 0) < -motion.dismissVelocity / 1000;
      if (e.contentOffset.y < -PULL_CLOSE || (e.contentOffset.y < -12 && fast)) runOnJS(pulledDown)();
    },
  });

  // Dragging the bar down: on the one-line bar it closes the search; on the grown card it folds it.
  const pan = usePanGesture({
    enabled: live,
    activeOffsetY: [-12, 12],
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      if (grow.value > 0.5) cardDrag.value = e.translationY > 0 ? e.translationY * 0.5 : 0;
      else drag.value = e.translationY > 0 ? e.translationY : e.translationY / 8;
    },
    onDeactivate: (e) => {
      'worklet';
      if (grow.value > 0.5) {
        if (e.translationY > PULL_COLLAPSE || e.velocityY > 600) runOnJS(collapse)();
        cardDrag.value = withTiming(0, { duration: 220 });
        return;
      }
      if (e.translationY > PULL_CLOSE || e.velocityY > motion.dismissVelocity) runOnJS(requestClose)();
      else drag.value = withTiming(0, { duration: motion.inMs });
    },
  });

  // Settled, one line, keyboard down: the tab bar's place.
  const restY = screenH - bottomGap - HEAD_H;
  const restW = width - side * 2;

  const layerStyle = useAnimatedStyle(() => ({ opacity: shown.value * (1 - hiddenForPage.value) }));

  // The card's frame is laid out once, at full grown size, bottom at the bar's resting spot.
  // It travels from Home's bar and rides the keyboard by transform only.
  const frameStyle = useAnimatedStyle(() => {
    const kb = Math.max(0, -keyboard.height.value);
    const lift = Math.max(bottomGap, kb + KB_GAP) - bottomGap;
    const dx0 = fromX.value + fromW.value / 2 - width / 2;
    const dy0 = fromY.value + fromH.value / 2 - (restY + HEAD_H / 2);
    return {
      transform: [
        { translateX: interpolate(p.value, [0, 1], [dx0, 0], Extrapolation.EXTEND) },
        { translateY: interpolate(p.value, [0, 1], [dy0, 0], Extrapolation.EXTEND) - lift + cardDrag.value },
      ],
    };
  });
  // Only the background grows: a plain view, nothing inside it to lay out again.
  const cardStyle = useAnimatedStyle(() => ({ height: HEAD_H + grow.value * GROW }));
  // At the start the background is scaled to Home's bar (a little wider) and eases to its own size.
  const skinStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: interpolate(p.value, [0, 1], [fromW.value / restW, 1], Extrapolation.CLAMP) },
      { scaleY: interpolate(p.value, [0, 1], [fromH.value / HEAD_H, 1], Extrapolation.CLAMP) },
    ],
  }));
  const barSkin = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.45], [1, 0], Extrapolation.CLAMP) }));
  const face = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.25], [1, 0], Extrapolation.CLAMP) }));
  const lineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.4, 0.85], [0, 1], Extrapolation.CLAMP) * interpolate(grow.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));
  const fieldsStyle = useAnimatedStyle(() => ({ opacity: interpolate(grow.value, [0.45, 1], [0, 1], Extrapolation.CLAMP) }));
  const page = useAnimatedStyle(() => ({
    opacity:
      interpolate(p.value, leaving.value ? [0, 0.3] : [0, 0.6], [0, 1], Extrapolation.CLAMP) *
      interpolate(drag.value + pull.value, [0, PULL_CLOSE * 3], [1, 0.75], Extrapolation.CLAMP),
  }));
  const list = useAnimatedStyle(() => {
    const y = leaving.value ? interpolate(p.value, [0, 1], [TUCK, 0], Extrapolation.CLAMP) : interpolate(p.value, [0, 1], [48, 0], Extrapolation.CLAMP);
    return {
      opacity: leaving.value ? interpolate(p.value, [0, 0.25], [0, 1], Extrapolation.CLAMP) : 1,
      transform: [{ translateY: y + Math.max(0, drag.value) }],
    };
  });
  // While closing, the page only exists above the middle of the bar, so the list reads as
  // tucked under it and Home shows below the bar as it lands. (Height of a clip with one
  // child that is laid out once: the child keeps its own size.)
  const clip = useAnimatedStyle(() => ({
    height: leaving.value
      ? interpolate(p.value, [0, 1], [fromY.value + fromH.value / 2, restY + HEAD_H / 2], Extrapolation.EXTEND)
      : screenH,
  }));
  const tripsFade = useAnimatedStyle(() => ({ opacity: interpolate(grow.value, [0, 0.6], [1, 0], Extrapolation.CLAMP) }));
  const placesFade = useAnimatedStyle(() => ({ opacity: interpolate(grow.value, [0.2, 1], [0, 1], Extrapolation.CLAMP) }));
  const dock = useAnimatedStyle(() => ({
    opacity: leaving.value ? 0 : interpolate(p.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
  }));
  // The towns fade out just above the card, wherever the keyboard has put it.
  // (A fixed full-screen view slid into place, so nothing is laid out as the keyboard moves.)
  const cardFade = useAnimatedStyle(() => {
    const kb = Math.max(0, -keyboard.height.value);
    const top = Math.max(bottomGap, kb + KB_GAP) + HEAD_H + grow.value * GROW;
    return { opacity: grow.value, transform: [{ translateY: screenH - top - FADE_H }] };
  });

  const nativeGlass = LIQUID_GLASS && settled && live && !picking && !restGrown;
  const showDays = !picking;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={live ? 'box-none' : 'none'}
      importantForAccessibility={live ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!live}
    >
      <Animated.View style={[StyleSheet.absoluteFill, layerStyle]} pointerEvents="box-none" accessibilityViewIsModal={live}>
        <Animated.View style={[styles.clip, clip]} pointerEvents="box-none">
          <View style={[styles.unclip, { height: screenH }]} pointerEvents="box-none">
            <Animated.View style={[StyleSheet.absoluteFill, styles.page, page]}>
              <Animated.ScrollView
                ref={listRef}
                onScroll={onScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                // Dragging the towns puts the keyboard away; the card stays open.
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingTop: showDays ? (daysH || insets.top + DAYS_ROW_H) + space.xs : insets.top + space.md,
                  paddingBottom: picking ? bottomGap + CARD_H + KB_ROOM + FADE_H : bottomGap + HEAD_H + space.lg + ALERT_ROOM,
                  paddingHorizontal: space.screen,
                  direction,
                }}
              >
                <Animated.View style={list}>
                  {/* Both lists stay built; picking only flips which one shows. */}
                  <Animated.View style={[{ gap: space.md }, tripsFade, picking ? styles.gone : null]}>
                    <SearchResults s={s} onOpenTrip={openTrip} dockedAlert />
                  </Animated.View>
                  <Animated.View style={[placesFade, picking ? null : styles.gone]}>
                    <PlaceResults
                      search={places}
                      exclude={picking === 'origin' ? s.destination : s.origin}
                      current={picking ? s[picking] : undefined}
                      recent={recentPlaces()}
                      onPick={pickTown}
                    />
                  </Animated.View>
                </Animated.View>
              </Animated.ScrollView>
            </Animated.View>

            {/* A porcelain band behind the status bar; while picking, the towns fade into it. */}
            <Animated.View style={[styles.statusBand, { height: insets.top }, page]} pointerEvents="none" />
            {picking ? (
              <LinearGradient
                pointerEvents="none"
                colors={[colors.surface, `${colors.surface}00`]}
                style={[styles.topFade, { top: insets.top, height: FADE_H }]}
              />
            ) : null}

            {/* The day row stays pinned at the top while the trips scroll under its frosted band. */}
            {showDays ? (
              <Animated.View style={[styles.days, { paddingTop: insets.top + space.sm }, list]} onLayout={(e) => setDaysH(e.nativeEvent.layout.height)}>
                <Animated.View style={[StyleSheet.absoluteFill, page]} pointerEvents="none">
                  <BlurView intensity={40} tint={themeScheme} style={StyleSheet.absoluteFill} />
                  <View style={[StyleSheet.absoluteFill, styles.daysFill]} />
                </Animated.View>
                <Animated.View style={page}>
                  <DayChips s={s} inset={space.screen} />
                </Animated.View>
              </Animated.View>
            ) : null}
          </View>
        </Animated.View>

        {/* The towns dissolve just above the card and the keyboard instead of being cut off by them. */}
        <Animated.View style={[styles.cardFade, { height: screenH }, cardFade]} pointerEvents="none">
          <LinearGradient colors={[`${colors.surface}00`, colors.surface]} style={{ height: FADE_H }} />
          <View style={{ flex: 1, backgroundColor: colors.surface }} />
        </Animated.View>

        {nativeGlass ? (
          // Real Liquid Glass sits on its own, outside every animated or clipped parent,
          // at the settled bar's exact spot.
          <View pointerEvents="none" style={{ position: 'absolute', top: restY, left: side, width: restW, height: HEAD_H }}>
            <GlassView
              pointerEvents="none"
              glassEffectStyle="regular"
              tintColor={colors.glassTint}
              colorScheme={themeScheme}
              style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]}
            />
          </View>
        ) : null}

        {picking || !live ? null : (
          <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: side, right: side, bottom: bottomGap + HEAD_H + 12, direction }, dock]}>
            <AlertMe s={s} docked />
          </Animated.View>
        )}

        <Animated.View style={[styles.frame, { left: side, right: side, bottom: bottomGap }, frameStyle]} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.card, cardStyle]}>
              <Animated.View style={[styles.skin, skinStyle]} pointerEvents="none">
                {nativeGlass ? null : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.lifted }]} />}
                <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.sunken }, barSkin]} />
              </Animated.View>

              <View style={styles.inside}>
                {/* Home's bar, so the first frame looks exactly like what you tapped. */}
                <Animated.View style={[styles.face, { direction }, face]} pointerEvents="none">
                  <Icon name="search" />
                  <Text style={[styles.faceText, { fontFamily: f.bold }]}>{t('findSeatTitle')}</Text>
                </Animated.View>

                {/* The one-line bar: close, the route (tap From or To), swap. */}
                <Animated.View style={[styles.line, { direction }, lineStyle]} pointerEvents={picking ? 'none' : 'box-none'}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('closeSearch')} onPress={requestClose} hitSlop={6} style={styles.round}>
                    <Icon name="x" size={18} />
                  </Pressable>
                  <View style={styles.ends}>
                    <View style={styles.dots}>
                      <View style={styles.dotStart} />
                      <View style={styles.dotLine} />
                      <View style={styles.dotEnd} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {(['origin', 'destination'] as const).map((end) => (
                        <Pressable
                          key={end}
                          accessibilityRole="button"
                          accessibilityLabel={t(end === 'origin' ? 'fromPlace' : 'toPlace').replace('{place}', placeName(s[end], lang))}
                          onPress={() => startPicking(end)}
                          hitSlop={{ top: 2, bottom: 2 }}
                        >
                          <Text style={[styles.route, { fontFamily: f.bold }]} numberOfLines={1}>
                            {placeName(s[end], lang)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('swapDirection')} onPress={() => { tapFeel(); s.swap(); }} hitSlop={6} style={styles.round}>
                    <Icon name="arrowsDownUp" size={18} />
                  </Pressable>
                </Animated.View>

                {/* Grown: back, which end you're choosing, swap; then the two fields. Always
                    built, so the fields exist the moment you tap and the caret can jump
                    between them without the keyboard going down. */}
                <Animated.View style={[styles.grown, { direction }, fieldsStyle]} pointerEvents={picking ? 'box-none' : 'none'}>
                  <View style={styles.headRow}>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={collapse} hitSlop={6} style={styles.round}>
                      <Icon name={rtl ? 'caretRight' : 'caretLeft'} size={18} />
                    </Pressable>
                    <Text style={[styles.title, { fontFamily: f.bold }]}>{t(picking === 'destination' ? 'whereTo' : 'whereFrom')}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('swapDirection')} onPress={() => { tapFeel(); s.swap(); }} hitSlop={6} style={styles.round}>
                      <Icon name="arrowsDownUp" size={18} />
                    </Pressable>
                  </View>
                  <RouteFields s={s} places={places} inputs={inputs} onSubmit={pickTop} />
                </Animated.View>
              </View>
            </Animated.View>
          </GestureDetector>
        </Animated.View>

        {trip ? (
          <TripDetails
            key={trip.key}
            id={trip.id}
            from={trip.from}
            settled={trip.seen}
            closing={trip.closing}
            onRequestClose={() => setTrip((v) => (v ? { ...v, closing: true } : v))}
            onClosed={() => setTrip(null)}
            onFindOthers={() => setTrip((v) => (v ? { ...v, closing: true } : v))}
            backRef={tripBack}
          />
        ) : null}
      </Animated.View>
    </View>
  );
});

/**
 * From over To, both real text fields that stay on screen. The active one has the caret and
 * a ring; the other shows its town and takes the caret when tapped. Moving the caret between
 * two fields that both exist keeps the keyboard up.
 */
function RouteFields({
  s,
  places,
  inputs,
  onSubmit,
}: {
  s: SearchState;
  places: PlaceSearch;
  inputs: Record<End, RefObject<TextInputInstance | null>>;
  onSubmit: () => void;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f, rtl, direction } = useFont();
  const field = (end: End) => {
    const active = places.end === end;
    const town = placeName(s[end], lang);
    return (
      <Pressable
        key={end}
        onPress={() => inputs[end].current?.focus()}
        accessible={false}
        style={[styles.field, active && styles.fieldOn, { direction }]}
      >
        {active ? <Icon name="search" size={16} color={colors.inkSecondary} /> : null}
        <TextInput
          ref={inputs[end]}
          value={active ? places.q : ''}
          onChangeText={places.setQ}
          // Whichever way the caret got here (a tap, or From handing over to To), this end is open.
          onFocus={() => places.open(end)}
          // The town shows as the field's hint: dark when it's the other end, soft while you
          // type over it.
          placeholder={town || t('searchTownPlaceholder')}
          placeholderTextColor={active ? colors.inkSecondary : colors.ink}
          accessibilityLabel={`${t(end === 'origin' ? 'fromLabel' : 'toLabel')}: ${town}`}
          autoCorrect={false}
          autoComplete="off"
          returnKeyType={end === 'origin' ? 'next' : 'search'}
          submitBehavior="submit"
          onSubmitEditing={onSubmit}
          style={[styles.input, { fontFamily: f.medium, textAlign: inputAlign(rtl), writingDirection: direction }]}
        />
        {active && places.loading ? <ActivityIndicator size="small" color={colors.inkSecondary} /> : null}
        {active && !places.loading && places.q ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('clearTyping')} onPress={() => places.setQ('')} hitSlop={8} style={styles.clear}>
            <Icon name="x" size={12} color={colors.surface} />
          </Pressable>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View style={[styles.fields, { direction }]}>
      <View style={styles.fieldDots}>
        <View style={styles.dotStart} />
        <View style={[styles.dotLine, { height: 30 }]} />
        <View style={styles.dotEnd} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        {field('origin')}
        {field('destination')}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  page: { backgroundColor: colors.surface },
  gone: { display: 'none' },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  unclip: { position: 'absolute', left: 0, right: 0 },
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.surface },
  topFade: { position: 'absolute', left: 0, right: 0 },
  cardFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  days: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: space.sm },
  daysFill: { backgroundColor: colors.panel },
  // The card's frame: full grown size, bottom-anchored, moved by transform only.
  frame: { position: 'absolute', height: CARD_H, justifyContent: 'flex-end' },
  card: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  skin: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  inside: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', borderRadius: RADIUS },
  face: { position: 'absolute', left: 0, right: 0, bottom: 0, height: HEAD_H, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  faceText: { fontSize: 18, color: colors.ink },
  // Both contents are pinned to the card's bottom at their own full size; the card's
  // rounded clip reveals the grown one as the card rises.
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: HEAD_H, padding: PAD, flexDirection: 'row', alignItems: 'center', gap: 10 },
  grown: { position: 'absolute', left: 0, right: 0, bottom: 0, height: CARD_H, padding: PAD, paddingBottom: 4 + PAD, gap: GAP },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: ROW },
  title: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.ink, textAlign: 'center' },
  round: {
    width: ROW,
    height: ROW,
    borderRadius: ROW / 2,
    backgroundColor: inkWash(colors, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  route: { fontSize: 15, lineHeight: 21, color: colors.ink },
  ends: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { alignItems: 'center', gap: 2 },
  fieldDots: { width: 20, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dotStart: { width: 9, height: 9, borderRadius: 5, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: colors.card },
  dotLine: { width: 1.5, height: 8, backgroundColor: colors.lineStrong },
  dotEnd: { width: 9, height: 9, borderRadius: 2, backgroundColor: colors.ink },
  fields: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  field: { height: 44, borderRadius: 22, backgroundColor: colors.fill, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldOn: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 0, height: '100%' },
  clear: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.inkSecondary, alignItems: 'center', justifyContent: 'center' },
}));
