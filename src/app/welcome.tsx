// Welcome: the first screen a signed-out person sees after the intro.
// One graphite card plays Rafiq's four strongest promises like stories
// (a booked seat, verified drivers, live checkpoints, women-only trips).
// Each story runs 4.5 s; tap the card to skip ahead, hold it to pause.
// Below it: the phone number, then Apple / Google / Email in one row.
//
// The whole screen scrolls, so on a small phone nothing gets squeezed;
// a flexible spacer keeps the sign-in block at the bottom when it fits.

import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  ZoomIn,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { PsPlate } from '@/components/ps-plate';
import { Body, Button, Screen, TopBar, ltr, useFont } from '@/components/ui';
import { selectFeel } from '@/lib/haptics';
import { useSession, useT } from '@/lib/session';
import { appleSignInAvailable, signInWithApple, signInWithGoogle, type SignInResult } from '@/lib/social-sign-in';
import { track } from '@/lib/track';
import { colors, fonts, radii, sizes, space } from '@/theme/tokens';

const STORIES = [
  { title: 'story1Title', body: 'story1Body' },
  { title: 'story2Title', body: 'story2Body' },
  { title: 'story3Title', body: 'story3Body' },
  { title: 'story4Title', body: 'story4Body' },
] as const;
const STORY_MS = 4500;

// The card is graphite, so it has its own quiet palette.
const card = {
  bg: colors.ink,
  raised: '#2E3136',
  line: '#3E4147',
  dim: '#5A5D63',
  muted: '#A9ACB2',
  open: '#4FB27A',
  crowded: '#D9A53A',
  closed: '#E0566A',
};
const snappy = { damping: 18, stiffness: 240, mass: 0.8 };

export default function Welcome() {
  const { t, lang } = useT();
  const { f } = useFont();
  const { setChosenLanguage } = useSession();

  return (
    <Screen
      scroll
      top={
        <TopBar
          start={
            <View style={styles.wordmark}>
              <Text style={[styles.wordmarkAr, { fontFamily: fonts.ar.bold }]}>رفيق</Text>
              <Text style={[styles.wordmarkEn, { fontFamily: fonts.en.medium }]}>Rafiq</Text>
            </View>
          }
          end={
            <Pressable
              accessibilityRole="button"
              onPress={() => setChosenLanguage(lang === 'ar' ? 'en' : 'ar')}
              style={styles.langButton}
            >
              <Icon name="globe" size={14} />
              <Text style={[styles.langText, { fontFamily: lang === 'ar' ? fonts.en.medium : fonts.ar.medium }]}>
                {t('otherLanguage')}
              </Text>
            </Pressable>
          }
        />
      }
    >
      <StoryCard />

      <View style={{ flexGrow: 1 }} />

      <View style={{ gap: space.sm + 4 }}>
        <Button
          label={t('startWithPhone')}
          icon="phone"
          onPress={() => {
            track('signup_started');
            router.push('/sign-up/phone');
          }}
        />
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={[styles.orText, { fontFamily: f.regular }]}>{t('orSignInWith')}</Text>
          <View style={styles.orLine} />
        </View>
        <OtherWays />
        <Body muted small style={{ textAlign: 'center' }}>
          {t('termsNote')}
        </Body>
      </View>
    </Screen>
  );
}

/** The graphite card that plays the four stories. */
function StoryCard() {
  const { t } = useT();
  const { f, rtl } = useFont();
  const { height } = useWindowDimensions();
  const [story, setStory] = useState(0);
  const progress = useSharedValue(0);

  const next = useCallback(() => setStory((s) => (s + 1) % STORIES.length), []);

  const run = useCallback(
    (from: number) => {
      progress.value = from;
      progress.value = withTiming(1, { duration: STORY_MS * (1 - from), easing: Easing.linear }, (done) => {
        if (done) runOnJS(next)();
      });
    },
    [progress, next],
  );

  useEffect(() => {
    run(0);
    return () => cancelAnimation(progress);
  }, [story, run, progress]);

  // Forward is to the left in Arabic, to the right in English.
  const entering = (rtl ? FadeInLeft : FadeInRight).springify().damping(snappy.damping).stiffness(snappy.stiffness);
  const exiting = (rtl ? FadeOutRight : FadeOutLeft).duration(160);
  const cardHeight = Math.max(420, Math.min(480, height - 380));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t(STORIES[story].title)} ${t('storyLabel')}`}
      onPress={() => {
        selectFeel();
        next();
      }}
      onLongPress={() => {}}
      onPressIn={() => cancelAnimation(progress)}
      onPressOut={() => run(progress.value)}
      style={[styles.card, { height: cardHeight }]}
    >
      <View style={styles.segments}>
        {STORIES.map((_, k) => (
          <Segment key={k} state={k < story ? 'done' : k === story ? 'now' : 'next'} progress={progress} />
        ))}
      </View>

      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View key={story} entering={entering} exiting={exiting} style={styles.stage}>
          {story === 0 ? <SeatStory /> : story === 1 ? <DriverStory /> : story === 2 ? <CheckpointStory /> : <WomenStory />}
        </Animated.View>
      </View>

      <Animated.View key={`text-${story}`} entering={FadeInDown.duration(280).delay(60)} style={{ gap: 6 }}>
        <Text style={[styles.storyTitle, { fontFamily: f.bold }]}>{t(STORIES[story].title)}</Text>
        <Text style={[styles.storyBody, { fontFamily: f.regular }]}>{t(STORIES[story].body)}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Segment({ state, progress }: { state: 'done' | 'now' | 'next'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({
    width: `${(state === 'done' ? 1 : state === 'now' ? progress.value : 0) * 100}%`,
  }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, fill]} />
    </View>
  );
}

/** Story 1: a car glides from Ramallah to Nablus while your seat fills in. */
function SeatStory() {
  const { t } = useT();
  const { f, rtl } = useFont();
  const drive = useSharedValue(0);
  useEffect(() => {
    drive.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.bezier(0.45, 0, 0.3, 1) }), withDelay(500, withTiming(0, { duration: 0 }))), -1);
  }, [drive]);
  const TRACK = 150;
  // Explicit left/right maths so the car always starts at the departure city, in both directions.
  const car = useAnimatedStyle(() => ({ transform: [{ translateX: (rtl ? 1 - drive.value : drive.value) * (TRACK - 26) }] }));

  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <Text style={styles.heroTime}>{ltr('7:30')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={[styles.cardLabel, { fontFamily: f.medium }]}>{t('ramallah')}</Text>
        <View style={{ width: TRACK, height: 26, justifyContent: 'center', direction: 'ltr' }}>
          <View style={styles.dottedRoad} />
          <Animated.View style={[styles.carChip, car]}>
            <Icon name="carProfile" size={14} color={card.bg} flip={rtl} />
          </Animated.View>
        </View>
        <Text style={[styles.cardLabel, { fontFamily: f.medium }]}>{t('nablus')}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        <View style={[styles.seat, { backgroundColor: colors.onInk }]} />
        <View style={[styles.seat, styles.seatEmpty]}>
          <Animated.View entering={ZoomIn.delay(650).springify().damping(12).stiffness(260)} style={[styles.seat, styles.seatMine]}>
            <Icon name="check" size={18} color={card.bg} />
          </Animated.View>
        </View>
        <View style={[styles.seat, styles.seatEmpty]} />
      </View>
      <Animated.View entering={FadeInDown.delay(950).springify()} style={styles.priceChip}>
        <Text style={[styles.priceText, { fontFamily: fonts.en.bold }]}>{ltr('25₪')}</Text>
        <Text style={[styles.priceText, { fontFamily: f.regular, color: card.muted }]}> · {t('cash')}</Text>
      </Animated.View>
    </View>
  );
}

/** Story 2: the driver's checks tick in one by one, then the plate writes itself. */
function DriverStory() {
  const { t } = useT();
  const { f } = useFont();
  const checks: [IconName, 'idVerified' | 'licenseVerified' | 'carVerified'][] = [
    ['identificationCard', 'idVerified'],
    ['steeringWheel', 'licenseVerified'],
    ['car', 'carVerified'],
  ];
  return (
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View>
        <View style={styles.avatar}>
          <Text style={[styles.avatarText, { fontFamily: f.bold }]}>{t('demoDriver').charAt(0)}</Text>
        </View>
        <Animated.View entering={ZoomIn.delay(250).springify().damping(10).stiffness(280)} style={styles.avatarBadge}>
          <Icon name="check" size={14} color={card.bg} />
        </Animated.View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {checks.map(([icon, key], k) => (
          <Animated.View key={key} entering={FadeInDown.delay(380 + k * 140).springify().damping(14)} style={styles.checkChip}>
            <Icon name={icon} size={12} color={colors.onInk} />
            <Text style={[styles.checkText, { fontFamily: f.medium }]}>{t(key)}</Text>
          </Animated.View>
        ))}
      </View>
      <Animated.View entering={FadeIn.delay(700).duration(240)} style={styles.plateWrap}>
        <PsPlate width={230} draw delay={820} />
      </Animated.View>
    </View>
  );
}

/** Story 3: a car rolls down the road and each checkpoint lights up as it passes. */
function CheckpointStory() {
  const { t } = useT();
  const { f } = useFont();
  const ROAD = 200;
  const roll = useSharedValue(0);
  useEffect(() => {
    roll.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.cubic) }), -1);
  }, [roll]);
  const car = useAnimatedStyle(() => ({ transform: [{ translateY: roll.value * (ROAD - 22) }] }));
  const points = [
    { name: t('cpAttara'), status: t('statusOpen'), color: card.open, at: 0.18, side: 'start' as const },
    { name: t('cpZaatara'), status: t('statusCrowded'), color: card.crowded, at: 0.5, side: 'end' as const },
    { name: t('cpHuwara'), status: t('statusClosed'), color: card.closed, at: 0.82, side: 'start' as const },
  ];
  return (
    <View style={{ width: 300, height: ROAD }}>
      <View style={styles.road} />
      {points.map((p, k) => (
        <View key={p.name} style={[styles.cpRow, { top: p.at * ROAD - 14 }]}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {p.side === 'start' ? <CpPill {...p} delay={200 + k * 260} f={f.medium} /> : null}
          </View>
          <Pulse color={p.color} delay={k * 400} />
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            {p.side === 'end' ? <CpPill {...p} delay={200 + k * 260} f={f.medium} /> : null}
          </View>
        </View>
      ))}
      <Animated.View style={[styles.rollingCar, car]}>
        <Icon name="carProfile" size={12} color={card.bg} />
      </Animated.View>
    </View>
  );
}

function CpPill({ name, status, color, delay, f }: { name: string; status: string; color: string; delay: number; f: string }) {
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(260)} style={styles.cpPill}>
      <Text numberOfLines={1} style={[styles.cpText, { fontFamily: f }]}>
        {name} <Text style={{ color }}>{status}</Text>
      </Text>
    </Animated.View>
  );
}

/** A status dot with a soft ring that breathes out from it. */
function Pulse({ color, delay = 0 }: { color: string; delay?: number }) {
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1));
  }, [ring, delay]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 1.6 }] }));
  return (
    <View style={styles.pulseBox}>
      <Animated.View style={[styles.pulseRing, { backgroundColor: color }, style]} />
      <View style={[styles.pulseDot, { backgroundColor: color }]} />
    </View>
  );
}

/** Story 4: three riders slide together, and the women-only badge pops in. */
function WomenStory() {
  const { t } = useT();
  const { f, rtl } = useFont();
  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 1400 })), -1);
  }, [breathe]);
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.06 }], opacity: 0.6 + breathe.value * 0.4 }));
  const people = ['a', 'b', 'c'];
  return (
    <View style={{ alignItems: 'center', gap: 22 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[styles.halo, halo]} />
        <View style={{ flexDirection: 'row' }}>
          {people.map((p, k) => (
            <Animated.View
              key={p}
              entering={(k === 0 ? (rtl ? FadeInRight : FadeInLeft) : k === 2 ? (rtl ? FadeInLeft : FadeInRight) : ZoomIn)
                .delay(80 + k * 90)
                .springify()
                .damping(14)
                .stiffness(220)}
              style={[styles.person, k > 0 && { marginStart: -16 }, { backgroundColor: k === 1 ? card.line : card.raised }]}
            >
              <Icon name="user" size={26} color={colors.onInk} />
            </Animated.View>
          ))}
        </View>
      </View>
      <Animated.View entering={ZoomIn.delay(520).springify().damping(11).stiffness(260)} style={styles.womenChip}>
        <FemaleIcon />
        <Text style={[styles.womenText, { fontFamily: f.bold }]}>{t('womenOnly')}</Text>
      </Animated.View>
    </View>
  );
}

function FemaleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
      <Circle cx={12} cy={9} r={5} />
      <Path d="M12 14v7M9 18h6" />
    </Svg>
  );
}

function AppleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill={colors.ink}>
      <Path d="M16.5 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 6.9 1.2 9.1.8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-.9-2.5-3.7zM14.3 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.6-1.3z" />
    </Svg>
  );
}

/** Apple (iPhone only), Google and an emailed code, side by side. */
function OtherWays() {
  const { t } = useT();
  const [apple, setApple] = useState(false);
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    appleSignInAvailable().then(setApple);
  }, []);

  async function run(which: 'apple' | 'google', go: () => Promise<SignInResult>) {
    if (busy) return;
    track('signup_social_started', { provider: which });
    setBusy(which);
    setFailed(false);
    const result = await go();
    setBusy(null);
    if (result === 'failed') setFailed(true);
    // On 'ok' the guards in _layout.tsx move on by themselves.
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {apple ? (
          <WayButton icon={<AppleIcon />} label={t('withApple')} latin busy={busy === 'apple'} onPress={() => run('apple', signInWithApple)} />
        ) : null}
        <WayButton
          icon={<Icon name="googleLogo" size={18} />}
          label={t('withGoogle')}
          latin
          busy={busy === 'google'}
          onPress={() => run('google', signInWithGoogle)}
        />
        <WayButton
          icon={<Icon name="envelope" size={18} />}
          label={t('withEmail')}
          onPress={() => {
            track('signup_started', { method: 'email' });
            router.push('/sign-up/email');
          }}
        />
      </View>
      {failed ? (
        <Body error small style={{ textAlign: 'center' }}>
          {t('signInFailed')}
        </Body>
      ) : null}
    </View>
  );
}

function WayButton({
  icon,
  label,
  latin,
  busy,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  latin?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const { f } = useFont();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.way, pressed && { transform: [{ scale: 0.97 }], backgroundColor: colors.sunken }]}
    >
      {busy ? <ActivityIndicator color={colors.ink} /> : icon}
      <Text style={[styles.wayText, { fontFamily: latin ? fonts.en.medium : f.medium }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  wordmarkAr: { fontSize: 22, color: colors.ink },
  wordmarkEn: { fontSize: 13, color: colors.inkSecondary },
  langButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langText: { fontSize: 13, color: colors.ink },

  card: {
    marginTop: space.sm,
    borderRadius: radii.sheet,
    borderCurve: 'continuous',
    backgroundColor: card.bg,
    paddingTop: space.md,
    paddingHorizontal: space.screen,
    paddingBottom: space.lg,
    gap: space.md,
  },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: card.line, overflow: 'hidden' },
  segmentFill: { height: 3, borderRadius: 2, backgroundColor: colors.onInk },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  storyTitle: { fontSize: 24, lineHeight: 32, color: colors.onInk, letterSpacing: -0.3 },
  storyBody: { fontSize: 14, lineHeight: 22, color: card.muted },
  cardLabel: { fontSize: 13, color: card.muted },

  heroTime: { fontFamily: fonts.en.bold, fontSize: 56, lineHeight: 60, color: colors.onInk, letterSpacing: -1.6 },
  dottedRoad: { height: 0, borderTopWidth: 2, borderColor: card.dim, borderStyle: 'dashed' },
  carChip: {
    position: 'absolute',
    left: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.onInk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seat: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  seatEmpty: { borderWidth: 1.5, borderColor: card.dim, borderStyle: 'dashed' },
  seatMine: { position: 'absolute', top: -1.5, start: -1.5, backgroundColor: colors.onInk },
  priceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: card.line,
  },
  priceText: { fontSize: 13, color: colors.onInk },

  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: card.raised, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 30, color: colors.onInk },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.onInk,
    borderWidth: 3,
    borderColor: card.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkChip: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: card.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkText: { fontSize: 11, color: colors.onInk },
  plateWrap: { marginTop: 4, borderRadius: 6, overflow: 'hidden' },

  road: { position: 'absolute', top: 0, bottom: 0, start: 149, width: 2, backgroundColor: card.dim },
  cpRow: { position: 'absolute', start: 0, end: 0, height: 28, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cpPill: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: card.line,
    backgroundColor: card.bg,
    justifyContent: 'center',
  },
  cpText: { fontSize: 12, color: colors.onInk },
  pulseBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  pulseRing: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  pulseDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: card.bg },
  rollingCar: {
    position: 'absolute',
    top: 0,
    start: 139,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.onInk,
    borderWidth: 2,
    borderColor: card.bg,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '90deg' }],
  },

  halo: { position: 'absolute', width: 196, height: 112, borderRadius: 56, borderWidth: 1.5, borderColor: card.line },
  person: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: card.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  womenChip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.onInk,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  womenText: { fontSize: 14, color: colors.ink },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 4 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.hairline },
  orText: { fontSize: 13, color: colors.inkSecondary },
  way: {
    flex: 1,
    height: sizes.control,
    borderRadius: radii.capsule,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  wayText: { fontSize: 14, color: colors.ink },
});
