// "Where to?" grows into the search, in place (design C1a, at the bottom since Nov 10: option D).
//
// The grey bar on Home lifts off, glides DOWN to the bottom of the screen and becomes a glass
// capsule with just the route, in the tab bar's place, where your thumb is (Apple's HIG:
// "place search at the bottom if there's room"). The day row (pinned at the top) and the trips fill
// the page above it and scroll under it. Tapping From or To grows the capsule upward into two
// fields that ride on top of the keyboard. × or a swipe down folds it back into Home's bar.
//
// Shape: one capsule rule for every bar at the bottom (search, trip bar): it sits as far in
// from the sides and bottom as its round ends need to follow the screen's corners
// (corners.capsuleInset), and its corner radius stays 31, concentric with the round buttons
// and capsule fields inside it (22 + 9 padding), also when it grows into the two fields.
//
// It is a layer drawn over Home, not a screen of its own: a morph needs the bar and the
// page on screen at once, which a jump between two screens can't give.
//
// Motion: one spring value `p` (0 = the bar, 1 = the header) drives everything, on the UI
// thread. Opening settles without a bounce; while
// it travels it keeps its shape (no stretch: it read as wobbly on the phone).
// With "Reduce motion" on, it just appears and disappears.
//
// Closing: the list slides down into the bar, so the page looks swallowed by the bar while
// the bar glides back up into Home's grey "Where to?". It is a
// near-critically damped spring, so it lands in Home's bar without a bounce.
//
// Staying smooth (Nov 10 rebuild, the rules this file follows):
// - Nothing heavy on the tap. The first frame is only this layer and the bar; the days and
//   trips are built once the bar has nearly landed (CONTENT_AFTER_MS) and fade in.
// - The bar travels by sliding (a transform), not by changing its frame, so the phone never
//   re-lays it out on the way. Its background alone is scaled to match Home's bar at the start.
//   Only growing into From/To changes its real size.
// - Swiping down on the grown card (or pulling the towns list down) collapses it to the bar;
//   swiping down on the bar closes the search.
//
// Glass is only on the bar, the one thing floating over content that scrolls under it.
// While it moves and changes size it is a frosted blur (Apple's Liquid Glass view turns
// into a flat grey block if it moves or is resized every frame). Once it has settled at the
// bottom, real Liquid Glass (iOS 26) takes over, and the bar stays pinned while you swipe down
// (only the page under it follows your finger), so the glass never moves. With the keyboard
// up (choosing a town) the bar moves with it, so it stays frosted then.

import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, type KeyboardEvent, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  KeyboardState,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DialogLayer } from '@/components/dialog-host';
import { Icon } from '@/components/icon';
import { PlaceFields, PlaceResults, PLACE_FIELDS_H, usePlaceSearch } from '@/components/place-search';
import { TripDetails } from '@/components/trip-details';
import { AlertMe, DayChips, SearchResults, type SearchState } from '@/components/trip-search';
import { useFont } from '@/components/ui';
import { tapFeel } from '@/lib/haptics';
import { placeName } from '@/lib/places';
import { useT } from '@/lib/session';
import { useScreenCorners } from '@/theme/screen-corners';
import { colors, motion, space } from '@/theme/tokens';

export type Rect = { x: number; y: number; width: number; height: number };

// The bar is one calm line: close, the route, swap. Everything you choose sits above it.
// 62pt tall, like the system tab bar whose place it takes.
const PAD = 9;
const ROW = 44;
const HEAD_H = PAD + ROW + PAD;
// Concentric with what's inside: the round buttons and capsule fields (radius 22) sit 9pt in.
const RADIUS = ROW / 2 + PAD;
// Gap between the bar and the top of the keyboard.
const KB_GAP = 8;
// The moving bar's fill: the porcelain page colour, a touch lighter so its edge reads.
const MOVING_FILL = 'rgba(251,250,248,0.98)';
// Below this the keyboard counts as gone (iOS reports a few points while it hides).
const MIN_KB = 40;
// How much taller the real keyboard is than iOS reports (see kbScale), and its real height,
// kept between opens.
let lastKbScale = 1;
let lastKbReal = 300;
// Room for the docked "Alert me" (a 56pt capsule and its gap) at the end of the list.
const ALERT_ROOM = 56 + 12;
// The days and trips are built this long after the tap: the bar is about 90% of the way by
// then, so building them can't hold up the first frame or stutter the glide.
const CONTENT_AFTER_MS = 260;
// Opening on From: the trips under the towns are built this long after the tap, once the
// bar, card and keyboard have all landed.
const TRIPS_AFTER_MS = 900;
// Swipe the grown card down this far (or flick it) to collapse it back to the bar.
const PULL_COLLAPSE = 36;
// Grown for place search: the two From/To fields under the row.
// A little more air than the one-line bar: 10 between the row and the fields, 12 under them.
const GAP = 10;
const GROW = GAP + PLACE_FIELDS_H + 4;
// Grow and shrink on the iOS sheet curve: quick to start, long soft landing, no bounce.
const GROW_MS = 380;
const GROW_EASE = Easing.bezier(0.32, 0.72, 0, 1);

// Critically damped: it lands on its spot without overshooting past it (the bounce looked wobbly).
const OPEN = { damping: 28, stiffness: 200, mass: 1 };
// Swipe down to close: past this far, or flicked fast (same feel as the app's sheets).
const PULL_CLOSE = 90;
// Closing: a near-critically damped spring (no bounce near the bar).
const CLOSE = { damping: 30, stiffness: 260, mass: 1, overshootClamping: true };
// How far the list slides down into the bar as it folds away.
const TUCK = 220;
const LIQUID_GLASS = isLiquidGlassAvailable();
// The pinned day row before it has measured itself: 8 above, the 44pt calendar circle, 8 below.
const DAYS_ROW_H = space.sm + 44 + space.sm;

export function SearchMorph({
  from,
  s,
  hidden,
  closing,
  onRequestClose,
  onClosed,
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
}) {
  const { t, lang } = useT();
  // Place search, in the header itself: tapping From or To grows the bar into two fields.
  const places = usePlaceSearch();
  const picking = places.end;
  const { f, rtl, direction } = useFont();
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const corners = useScreenCorners();
  // The keyboard, frame by frame on the UI thread, so the card rides it without waiting on
  // JavaScript (the old JS-driven chase started late whenever the app was busy, which is
  // what made picking a town feel laggy).
  // iOS 26 reports a keyboard height that is short of where the keyboard is really drawn
  // (the To field ended up under it). Once the keyboard has landed we compare that height
  // with the keyboard's real top edge on screen and keep the RATIO in `kbScale`, remembered
  // for next time. A ratio, not an offset: an offset made the card jump by ~30pt on the
  // keyboard's very first frame, which read as a stutter; scaled, it rises in step from zero.
  const keyboard = useAnimatedKeyboard();
  const kbScale = useSharedValue(lastKbScale);
  // The landed keyboard's real height (0 = no keyboard).
  const [kbReal, setKbReal] = useState(0);
  const kbUp = kbReal > 0;
  // 1 while a keyboard is (coming) up, eased to 0 when it leaves. The card's lift is multiplied
  // by it, so the card always comes down with the keyboard even if the tracked height above
  // is late or sticks (it left the grown card hanging mid-screen after the keyboard was closed).
  const kbOn = useSharedValue(1);
  // Where the keyboard WILL end (its real height), known from the moment it starts to rise.
  // While the search is opening, the bar heads straight there instead of first aiming at the
  // bottom and then turning up with the keyboard (that dip-and-rise read as a jump).
  const kbTarget = useSharedValue(0);
  const kbGone = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const coming = (e?: KeyboardEvent) => {
      if (kbGone.current) clearTimeout(kbGone.current);
      kbOn.value = 1;
      // Before the keyboard starts to rise, iOS already says where it will end up. Correct the
      // scale now, so the card rides up in one go; correcting it once the keyboard had landed
      // made the card rise and then nudge up a second time (Waleed, Nov 11).
      const real = e ? Math.max(0, screenH - e.endCoordinates.screenY) : 0;
      if (real > MIN_KB) kbTarget.value = real;
      const reported = e?.endCoordinates.height ?? 0;
      if (real > MIN_KB && reported > MIN_KB) {
        lastKbScale = Math.max(lastKbScale, real / reported);
        kbScale.value = lastKbScale;
      }
    };
    // The keyboard left while From/To was open (its own dismiss key, Search, a swipe, a tap
    // outside the field): the card comes down with it and goes back to the one-line bar.
    const left = (e?: KeyboardEvent) => {
      kbTarget.value = 0;
      setKbReal(0);
      if (Platform.OS === 'ios') kbOn.value = withTiming(0, { duration: e?.duration || 250 });
      typingEnded();
    };
    const landed = (e: KeyboardEvent) => {
      const real = Math.max(0, screenH - e.endCoordinates.screenY);
      if (real <= MIN_KB) return setKbReal(0);
      setKbReal(real);
      lastKbReal = Math.max(lastKbReal, real);
      const reported = keyboard.height.value;
      if (reported > MIN_KB) {
        // Only a real miss is corrected here (more than a few points): the estimate made as
        // the keyboard started is normally right already, and a late fix shows as a nudge.
        const scale = Math.max(1, real / reported);
        if (Math.abs(scale - kbScale.value) * reported > 3) {
          lastKbScale = scale;
          kbScale.value = withTiming(lastKbScale, { duration: 160 });
        }
      }
    };
    const subs = [
      Keyboard.addListener('keyboardDidShow', landed),
      ...(Platform.OS === 'ios'
        ? [Keyboard.addListener('keyboardDidChangeFrame', landed), Keyboard.addListener('keyboardWillShow', coming)]
        : []),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', left),
    ];
    return () => {
      subs.forEach((sub) => sub.remove());
      if (kbGone.current) clearTimeout(kbGone.current);
    };
  }, [screenH]); // eslint-disable-line react-hooks/exhaustive-deps
  // How far the keyboard's top edge is from the bottom of the screen, now (0 = none).
  const kbLift = () => {
    'worklet';
    // Once the keyboard reports itself closed, nothing it says about its height counts.
    if (keyboard.state.value === KeyboardState.CLOSED) return 0;
    return keyboard.height.value * kbScale.value * kbOn.value;
  };
  // At rest the capsule follows the screen corners; grown into the fields it becomes a card
  // that floats 8pt from the sides, like the trip card.
  const side = corners.capsuleInset(HEAD_H);
  const bottomGap = side;
  const growSide = corners.inset;

  // A trip opened from the results grows out of its row, right here over the search
  // (TripDetails is the same card the rest of the app opens). `seen`: it was shown before
  // the search stepped aside for a page (the ID check), so it comes back without the morph.
  const [trip, setTrip] = useState<{ id: string; from: Rect | null; key: number; closing: boolean; seen: boolean } | null>(null);
  const tripBack = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (hidden) setTrip((v) => (v ? { ...v, seen: true } : v));
  }, [hidden]);
  const openTrip = (id: string, at?: Rect | null) => {
    tapFeel();
    setTrip((v) => ({ id, from: at ?? null, key: (v?.key ?? 0) + 1, closing: false, seen: false }));
  };

  const p = useSharedValue(0);
  // 0 = the one-line bar, 1 = grown into the From/To fields.
  const grow = useSharedValue(0);
  // The size the bar last came to rest at (true = grown). While it is on its way to the other
  // size, `resizing` is true and the native glass steps aside for the frosted stand-in, because
  // Liquid Glass turns grey while its size animates. Once it lands, grown or not, it is real
  // Liquid Glass again.
  const [restGrown, setRestGrown] = useState(false);
  const resizing = !!picking !== restGrown;
  useEffect(() => {
    const target = !!picking;
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) runOnJS(setRestGrown)(target);
    };
    grow.value = withTiming(target ? 1 : 0, reduced ? { duration: 120 } : { duration: GROW_MS, easing: GROW_EASE }, done);
  }, [picking]); // eslint-disable-line react-hooks/exhaustive-deps
  // The end of the list makes room for the grown card and the keyboard under it, so the last
  // towns can scroll up into view. A plain number set once per pick, not animated: animating
  // it re-laid out the whole list on every frame of the keyboard's rise (the stutter on grow).
  // Sized for the tallest keyboard seen (it grows a strip of suggestions while you type).
  // The list's own bottom padding already holds the bar and Alert me's room, so this only
  // adds the card's growth and the keyboard: the last town ends just above the card.
  const endSpace = picking ? Math.max(0, GROW + Math.max(kbReal, lastKbReal) + KB_GAP - bottomGap - ALERT_ROOM) : 0;
  // The trips and the towns are both kept built; picking only cross-fades between them.
  const tripsFade = useAnimatedStyle(() => ({ opacity: interpolate(grow.value, [0, 0.6], [1, 0], Extrapolation.CLAMP) }));
  const placesFade = useAnimatedStyle(() => ({ opacity: interpolate(grow.value, [0.2, 1], [0, 1], Extrapolation.CLAMP) }));
  // Swipe down to close. `drag` = the header pulled by a finger (the page follows);
  // `pull` = the list pulled past its top (iOS rubber band; the header follows halfway).
  const drag = useSharedValue(0);
  const pull = useSharedValue(0);
  const leaving = useSharedValue(0); // 1 while closing: the list tucks up instead of dropping down
  // The grown card pulled down by a finger, before it lets go and collapses.
  const cardDrag = useSharedValue(0);
  // The page's content waits for the bar to (nearly) land; see CONTENT_AFTER_MS.
  const [ready, setReady] = useState(!!reduced);
  const pickingRef = useRef(picking);
  pickingRef.current = picking;
  // Each list starts at its top: the towns open at the big cities, and coming back to the
  // trips doesn't land part-way down them (the towns' scroll used to carry over and jump).
  const listRef = useAnimatedRef<Animated.ScrollView>();
  useEffect(() => {
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, [!!picking]); // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * Typing stopped (the field lost its caret, or the keyboard left): if no field has the
   * caret a moment later, From/To closes back to the one-line bar. The moment lets a switch
   * between the From and To fields land first. Asked about the caret, not the keyboard:
   * the keyboard still counts as visible until its hide animation ends, which is why a tap
   * outside the list left the grown card hanging.
   */
  const typingEnded = () => {
    if (kbGone.current) clearTimeout(kbGone.current);
    kbGone.current = setTimeout(() => {
      if (pickingRef.current && !TextInput.State.currentlyFocusedInput()) places.close();
    }, 120);
  };
  /** From/To back to the one-line bar, keyboard away. */
  const collapse = () => {
    tapFeel();
    places.close();
    Keyboard.dismiss();
  };
  /** The list pulled down past its top: collapses the fields first, then closes the search. */
  const pulledDown = () => (pickingRef.current ? collapse() : requestClose());
  // Real Liquid Glass only while the bar is still at the bottom (see the note at the top).
  const [settled, setSettled] = useState(false);
  // The pinned day row's height (it grows while the month is open), so the trips start under it.
  const [daysH, setDaysH] = useState(0);
  const showDays = ready && !picking;
  // The trips list is the heaviest thing here. The search opens on From, so it isn't seen
  // yet: build it once you leave the towns (or after the opening has fully settled), never
  // while the bar and keyboard are moving.
  const [tripsBuilt, setTripsBuilt] = useState(!!reduced);
  useEffect(() => {
    if (tripsBuilt) return;
    if (ready && !picking) return setTripsBuilt(true);
    const id = setTimeout(() => setTripsBuilt(true), TRIPS_AFTER_MS);
    return () => clearTimeout(id);
  }, [ready, picking, tripsBuilt]);

  // The search opens on the trips, not in From: you tap the bar to change the route
  // (Waleed, Nov 11 22:17, undoing the auto-focus from earlier that day).

  useEffect(() => {
    if (!closing) {
      leaving.value = 0;
      const arrived = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(setSettled)(true);
      };
      p.value = reduced ? withTiming(1, { duration: 120 }, arrived) : withSpring(1, OPEN, arrived);
      const id = setTimeout(() => setReady(true), reduced ? 0 : CONTENT_AFTER_MS);
      return () => clearTimeout(id);
    } else {
      setSettled(false);
      leaving.value = 1;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) runOnJS(onClosed)();
      };
      // The bar goes up into Home while a swipe is downward, so it starts from rest.
      p.value = reduced ? withTiming(0, { duration: 120 }, done) : withSpring(0, CLOSE, done);
      drag.value = reduced ? 0 : withSpring(0, CLOSE);
    }
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Settled, one line, keyboard down: the tab bar's place.
  const to = { x: side, y: screenH - bottomGap - HEAD_H, width: width - side * 2 };
  // Native glass only there: grown, it rides on the keyboard, and moving glass turns grey.
  const nativeGlass = LIQUID_GLASS && settled && !closing && !resizing && !picking && !restGrown && !kbUp;
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
        runOnJS(pulledDown)();
      }
    },
  });

  // Dragging the bar down works everywhere (Android lists don't rubber-band).
  // On the one-line bar it closes the search; on the grown card it collapses it to the bar.
  const pan = usePanGesture({
    enabled: !closing,
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
      if (e.translationY > PULL_CLOSE || e.velocityY > motion.dismissVelocity) {
        runOnJS(requestClose)();
      } else drag.value = withTiming(0, { duration: motion.inMs });
    },
  });

  // The bar is laid out once, at its resting place at the bottom, and SLIDES there from
  // Home's bar: only a transform changes on the way, so nothing is laid out again per frame.
  // (Its real size only changes when it grows into the From/To fields.)
  const dx0 = from.x + from.width / 2 - width / 2;
  const dy0 = from.y + from.height / 2 - (screenH - bottomGap - HEAD_H / 2);
  const glassStyle = useAnimatedStyle(() => {
    const landedSide = side + (growSide - side) * grow.value;
    // Never lower than its resting spot: a few points of keyboard while it hides used to drop
    // the bar under it, which showed as a ghost outline with Alert me sitting on it.
    // Opening: aim at where the keyboard will be, not where it is this frame.
    const kb = p.value < 1 && !leaving.value ? Math.max(kbLift(), kbTarget.value) : kbLift();
    const lift = Math.max(bottomGap, kb + KB_GAP);
    return {
      left: landedSide,
      width: width - landedSide * 2,
      height: HEAD_H + grow.value * GROW,
      transform: [
        { translateX: interpolate(p.value, [0, 1], [dx0, 0], Extrapolation.EXTEND) },
        { translateY: interpolate(p.value, [0, 1], [dy0, bottomGap - lift], Extrapolation.EXTEND) + cardDrag.value },
      ],
    };
  });
  // Its background starts scaled to Home's bar (a little wider and lower) and eases to its own
  // size. Only the background is scaled, so the text on it is never squashed.
  const skinStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: interpolate(p.value, [0, 1], [from.width / to.width, 1], Extrapolation.CLAMP) },
      { scaleY: interpolate(p.value, [0, 1], [from.height / HEAD_H, 1], Extrapolation.CLAMP) },
    ],
  }));
  // The bar's own grey covers the glass at first and melts away as it lifts.
  const barSkin = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.45], [1, 0], Extrapolation.CLAMP) }));
  const face = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.25], [1, 0], Extrapolation.CLAMP) }));
  const head = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.4, 0.85], [0, 1], Extrapolation.CLAMP),
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
  // Closing: the list slides down into the bar while the bar goes up, and the page is cut
  // off at the middle of the bar (see `clip`), so everything disappears into the glass.
  const list = useAnimatedStyle(() => {
    if (leaving.value) {
      return {
        opacity: interpolate(p.value, [0, 0.25], [0, 1], Extrapolation.CLAMP),
        transform: [
          { translateY: interpolate(p.value, [0, 1], [TUCK, 0], Extrapolation.CLAMP) + Math.max(0, drag.value) },
          { scale: 1 },
        ],
      };
    }
    return {
      opacity: 1,
      transform: [{ translateY: interpolate(p.value, [0, 1], [48, 0], Extrapolation.CLAMP) + Math.max(0, drag.value) }, { scale: 1 }],
    };
  });

  // While closing, the page only exists above the middle of the bar: what goes below it is
  // gone, so the list reads as tucked under the glass, and Home shows below the bar as it lands.
  // (Read the shared values inside the style itself, so Reanimated sees them change.)
  const clip = useAnimatedStyle(() => ({
    height: leaving.value
      ? interpolate(p.value, [0, 1], [from.y + from.height / 2, to.y + HEAD_H / 2], Extrapolation.EXTEND)
      : screenH,
  }));
  // "Alert me" docks just above the bar once it has landed, and steps away while you pick a town.
  const dock = useAnimatedStyle(() => ({
    opacity: leaving.value ? 0 : interpolate(p.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Modal visible={!hidden} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (trip ? tripBack.current?.() : picking ? places.close() : requestClose())}>
      {/* A Modal is its own native window, so gestures need their own root inside it. */}
      {/* Its own safe-area root too: inside a tab, the inherited insets count the tab bar
          as "unsafe", which pushed the card's buttons and bar about 50pt too high. */}
      <SafeAreaProvider style={StyleSheet.absoluteFill}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents={closing ? 'none' : 'auto'}>
        <Animated.View style={[styles.clip, clip]} pointerEvents="box-none">
        <View style={[styles.unclip, { height: screenH }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.page, page]}>
          <Animated.ScrollView
            ref={listRef}
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              // The trips start under the pinned day row; the towns right under the status bar.
              paddingTop: showDays ? (daysH || insets.top + DAYS_ROW_H) + space.xs : insets.top + space.md,
              paddingBottom: bottomGap + HEAD_H + space.lg + ALERT_ROOM,
              paddingHorizontal: space.screen,
              direction,
            }}
          >
            <Animated.View style={list}>
              {!ready ? null : (
                // Both lists stay built (the towns from the moment the trips are): tapping the
                // route then only flips which one is shown, so nothing heavy is created or
                // destroyed in the frame the keyboard starts to rise.
                <>
                  <Animated.View style={[{ gap: space.md }, tripsFade, picking ? styles.gone : null]} entering={reduced ? undefined : FadeIn.duration(220)}>
                    {tripsBuilt ? <SearchResults s={s} onOpenTrip={openTrip} dockedAlert /> : null}
                  </Animated.View>
                  <Animated.View style={[placesFade, picking ? null : styles.gone]}>
                    <PlaceResults
                      search={places}
                      exclude={picking === 'origin' ? s.destination : s.origin}
                      onPick={(id) => {
                        // From picked: straight on to To, card and keyboard stay up.
                        // To picked: the card folds down and the trips show.
                        if (pickingRef.current === 'origin') {
                          s.setOrigin(id);
                          places.open('destination');
                        } else {
                          if (pickingRef.current === 'destination') s.setDestination(id);
                          places.close();
                          Keyboard.dismiss();
                        }
                      }}
                    />
                  </Animated.View>
                </>
              )}
            </Animated.View>
            <View style={{ height: endSpace }} />
          </Animated.ScrollView>
        </Animated.View>

        {/* A porcelain band behind the status bar, so the list doesn't show through the clock. */}
        <Animated.View style={[styles.statusBand, { height: insets.top }, page]} pointerEvents="none" />

        {/* The day row stays pinned at the top while the trips scroll under its frosted band
            (design A, Nov 11). It steps away while you pick a town. */}
        {showDays ? (
          // Moves with the list (rises in on open, tucks away on close); fades with the page.
          // Separate views, because two opacities on one view would overwrite each other.
          <Animated.View
            style={[styles.days, { paddingTop: insets.top + space.sm }, list]}
            onLayout={(e) => setDaysH(e.nativeEvent.layout.height)}
          >
            <Animated.View style={[StyleSheet.absoluteFill, page]} pointerEvents="none">
              <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, styles.daysFill]} />
            </Animated.View>
            <Animated.View style={page}>
              <DayChips s={s} inset={space.screen} />
            </Animated.View>
          </Animated.View>
        ) : null}
        </View>
        </Animated.View>

        {nativeGlass ? (
          // Real Liquid Glass sits on its own, outside every animated, clipped or see-through
          // parent, at the settled header's exact spot. The moving bar above it goes clear.
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: to.y, left: to.x, width: to.width, height: HEAD_H }}
          >
            {/* The porcelain tint and a fixed light look keep it from turning grey over the white
                page (untinted glass adapts to what's behind it and reads as a grey slab here). */}
            <GlassView
              pointerEvents="none"
              glassEffectStyle="regular"
              tintColor={colors.glassTint}
              colorScheme="light"
              style={[StyleSheet.absoluteFill, { borderRadius: RADIUS }]}
            />
          </View>
        ) : null}

        {picking || closing || !ready ? null : (
          <Animated.View
            pointerEvents="box-none"
            style={[{ position: 'absolute', left: side, right: side, bottom: bottomGap + HEAD_H + 12, direction }, dock]}
          >
            <AlertMe s={s} docked />
          </Animated.View>
        )}

        <GestureDetector gesture={pan}>
        <Animated.View style={[styles.glass, { bottom: bottomGap }, glassStyle]}>
          <Animated.View style={[styles.skin, skinStyle]} pointerEvents="none">
          {/* While it moves or rides the keyboard, a plain porcelain fill. It travels over the
              porcelain page, where a blur shows nothing, and a blur redrawn at a new size every
              frame was the costliest thing on screen (part of the stutter). Real Liquid Glass
              takes over once it's still at the bottom. */}
          {nativeGlass ? null : <View style={[StyleSheet.absoluteFill, { backgroundColor: MOVING_FILL }]} />}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.sunken }, barSkin]} pointerEvents="none" />
          </Animated.View>

          {/* What's on the bar, clipped to its shape while it grows. */}
          <View style={styles.inside}>
          {/* The bar's face, so the first frame looks exactly like what you tapped (the text
              starts where Home's text is, though this bar is a little narrower). */}
          <Animated.View
            style={[styles.face, { height: HEAD_H, paddingHorizontal: Math.max(8, 18 - (to.x - from.x)), direction }, face]}
            pointerEvents="none"
          >
            <Icon name="search" />
            <Text style={[styles.faceText, { fontFamily: f.bold }]}>{t('findSeatTitle')}</Text>
          </Animated.View>

          <Animated.View style={[styles.head, { direction }, head]}>
            {picking ? (
              // Grown: back, which end you're choosing, swap; then the two fields.
              <Animated.View key="fields" entering={reduced ? undefined : FadeIn.duration(160)} style={{ gap: GAP }}>
                <View style={styles.headRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('back')} onPress={places.close} hitSlop={6} style={styles.round}>
                    <Icon name={rtl ? 'caretRight' : 'caretLeft'} size={18} />
                  </Pressable>
                  <Text style={[styles.route, { flex: 1, fontFamily: f.bold }]}>
                    {t(picking === 'origin' ? 'whereFrom' : 'whereTo')}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('swapDirection')} onPress={() => { tapFeel(); s.swap(); }} hitSlop={6} style={styles.round}>
                    <Icon name="arrowsDownUp" size={18} />
                  </Pressable>
                </View>
                <PlaceFields search={places} origin={s.origin} destination={s.destination} onBlur={typingEnded} />
              </Animated.View>
            ) : (
              <Animated.View key="line" entering={reduced || !resizing ? undefined : FadeIn.duration(160)} style={styles.headRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('closeSearch')} onPress={requestClose} hitSlop={6} style={styles.round}>
                  <Icon name="x" size={18} />
                </Pressable>
                {/* From over To: tap either to grow the bar into the place search. A ring marks the start, a square the end. */}
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
                        onPress={() => { tapFeel(); places.open(end); }}
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
            )}
          </Animated.View>
          </View>
        </Animated.View>
        </GestureDetector>

        {trip ? (
          <TripDetails
            key={trip.key}
            id={trip.id}
            from={trip.from}
            settled={trip.seen}
            closing={trip.closing}
            onRequestClose={() => setTrip((v) => (v ? { ...v, closing: true } : v))}
            onClosed={() => setTrip(null)}
            // Other trips that day: they're right here, under the card.
            onFindOthers={() => setTrip((v) => (v ? { ...v, closing: true } : v))}
            backRef={tripBack}
          />
        ) : null}
        {/* Pop-ups asked for over the search (the trip's Withdraw, Emergency) draw in this layer. */}
        <DialogLayer />
      </GestureHandlerRootView>
      </SafeAreaProvider>
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
  gone: { display: 'none' },
  clip: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  unclip: { position: 'absolute', left: 0, right: 0 },
  statusBand: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.surface },
  days: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: space.sm },
  // Mostly porcelain: the trips only show through as a soft blur, and the month reads as solid.
  daysFill: { backgroundColor: 'rgba(247,246,243,0.86)' },
  // The bar's frame: only slid about. Its look is `skin`, its contents are in `inside`.
  glass: { position: 'absolute' },
  skin: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    overflow: 'hidden',
    borderRadius: RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  inside: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', borderRadius: RADIUS },
  face: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 },
  faceText: { fontSize: 18, color: colors.ink },
  // Spans the card, so the buttons sit evenly in it at both widths (bar and grown card).
  head: { position: 'absolute', top: 0, left: 0, right: 0, padding: PAD },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: ROW },
  round: {
    width: ROW,
    height: ROW,
    borderRadius: ROW / 2,
    backgroundColor: 'rgba(23,25,28,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  route: { fontSize: 15, lineHeight: 21, color: colors.ink },
  ends: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { alignItems: 'center', gap: 2 },
  dotStart: { width: 9, height: 9, borderRadius: 5, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: colors.card },
  dotLine: { width: 1.5, height: 8, backgroundColor: colors.lineStrong },
  dotEnd: { width: 9, height: 9, borderRadius: 2, backgroundColor: colors.ink },
});
