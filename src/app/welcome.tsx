// Welcome: the first screen a signed-out person sees.
// Three slides answer the three worries about riding with a stranger between
// cities (will I get a seat, who is driving, what about checkpoints).
// They advance on their own every 4.5 s; tapping a dot jumps to a slide.

import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Body, Button, Screen, TopBar, ltr, useFont } from '@/components/ui';
import { useSession, useT } from '@/lib/session';
import { appleSignInAvailable, signInWithApple, signInWithGoogle, type SignInResult } from '@/lib/social-sign-in';
import { track } from '@/lib/track';
import { colors, fonts, radii, sizes, space } from '@/theme/tokens';

const SLIDES = [
  { title: 'slide1Title', body: 'slide1Body' },
  { title: 'slide2Title', body: 'slide2Body' },
  { title: 'slide3Title', body: 'slide3Body' },
] as const;

export default function Welcome() {
  const { t, lang } = useT();
  const { f } = useFont();
  const { setChosenLanguage } = useSession();
  const [slide, setSlide] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  // Auto-advance. Picking a slide by hand restarts the timer (slide is a dependency).
  useEffect(() => {
    const timer = setTimeout(() => setSlide((s) => (s + 1) % SLIDES.length), 4500);
    return () => clearTimeout(timer);
  }, [slide]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 420, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: true }).start();
  }, [slide, fade]);

  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <Screen
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
      footer={
        <>
          <Button
            label={t('startWithPhone')}
            onPress={() => {
              track('signup_started');
              router.push('/sign-up/phone');
            }}
          />
          <OtherWays />
          <Body muted small style={{ textAlign: 'center' }}>
            {t('termsNote')}
          </Body>
        </>
      }
    >
      <Animated.View style={[styles.hero, { opacity: fade, transform: [{ translateY: rise }] }]}>
        {slide === 0 ? <RouteSlide /> : slide === 1 ? <DriverSlide /> : <CheckpointSlide />}
      </Animated.View>

      <Animated.View style={{ gap: space.sm, opacity: fade }}>
        <Text style={[styles.slideTitle, { fontFamily: f.bold }]}>{t(SLIDES[slide].title)}</Text>
        <Body muted>{t(SLIDES[slide].body)}</Body>
      </Animated.View>

      <View style={styles.dots}>
        {SLIDES.map((_, k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={`${t('slideLabel')} ${k + 1}`}
            onPress={() => setSlide(k)}
            style={styles.dotHit}
          >
            <View style={[styles.dot, k === slide && styles.dotOn]} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

/**
 * Besides the phone number: Apple (iPhone only, Apple's own button as its rules
 * require), Google, and an emailed code.
 */
function OtherWays() {
  const { t } = useT();
  const { f } = useFont();
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
      <Text style={[styles.orText, { fontFamily: f.medium }]}>{t('orSignInWith')}</Text>
      {apple ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE_OUTLINE}
          cornerRadius={sizes.control / 2}
          style={{ height: sizes.control }}
          onPress={() => run('apple', signInWithApple)}
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <WayButton icon="googleLogo" label={t('withGoogle')} busy={busy === 'google'} onPress={() => run('google', signInWithGoogle)} />
        <WayButton
          icon="envelope"
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

function WayButton({ icon, label, busy, onPress }: { icon: IconName; label: string; busy?: boolean; onPress: () => void }) {
  const { f } = useFont();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.way}>
      {busy ? <ActivityIndicator color={colors.ink} /> : <Icon name={icon} size={18} />}
      <Text style={[styles.wayText, { fontFamily: f.medium }]}>{label}</Text>
    </Pressable>
  );
}

/** Slide 1: a booked trip, from departure to arrival, with the car moving along. */
function RouteSlide() {
  const { t } = useT();
  const { f, rtl } = useFont();
  const drive = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drive, { toValue: 1, duration: 3400, easing: Easing.bezier(0.45, 0, 0.3, 1), useNativeDriver: true }),
        Animated.delay(1100),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drive]);
  const y = drive.interpolate({ inputRange: [0, 1], outputRange: [0, 124] });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <View style={styles.rail}>
          <View style={styles.railStart} />
          <View style={styles.railLine} />
          <View style={styles.railEnd} />
          <Animated.View style={[styles.car, { transform: [{ translateY: y }] }]}>
            <Icon name="carProfile" size={16} color={colors.onInk} />
          </Animated.View>
        </View>
        <View style={{ flex: 1, gap: 70 }}>
          <View>
            <Text style={[styles.heroTime, { textAlign: rtl ? 'right' : 'left' }]}>{ltr('7:30')}</Text>
            <Body muted>{t('demoFrom')}</Body>
          </View>
          <View>
            <Text style={[styles.heroTime, { textAlign: rtl ? 'right' : 'left' }]}>{ltr('8:40')}</Text>
            <Body muted>{t('demoTo')}</Body>
          </View>
        </View>
      </View>
      <View style={[styles.cpPill, rtl ? { left: 0 } : { right: 0 }]}>
        <View style={[styles.statusDot, { backgroundColor: colors.statusOpen }]} />
        <Text style={[styles.pillText, { fontFamily: f.medium }]}>
          {t('cpAttara')} <Text style={{ color: colors.statusOpen }}>{t('statusOpen')}</Text>
        </Text>
      </View>
      <View style={styles.seatCard}>
        <View style={{ gap: 2 }}>
          <Text style={[styles.seatTitle, { fontFamily: f.bold }]}>{t('demoSeat')}</Text>
          <Body muted small>
            {t('demoCar')} · {ltr('25₪')}
          </Body>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={[styles.seat, { backgroundColor: colors.ink }]} />
          <View style={[styles.seat, { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.card }]}>
            <Icon name="check" size={16} />
          </View>
          <View style={[styles.seat, { borderWidth: 1.5, borderColor: colors.lineStrong, borderStyle: 'dashed' }]} />
        </View>
      </View>
    </View>
  );
}

/** Slide 2: a verified driver's profile. */
function DriverSlide() {
  const { t } = useT();
  const { f, rtl } = useFont();
  return (
    <View style={styles.centered}>
      <View>
        <View style={styles.bigAvatar}>
          <Text style={[styles.bigAvatarText, { fontFamily: f.bold }]}>{t('demoDriver').charAt(0)}</Text>
        </View>
        <View style={[styles.verifiedBadge, rtl ? { left: 0 } : { right: 0 }]}>
          <Icon name="check" size={14} color={colors.onInk} />
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={[styles.driverName, { fontFamily: f.bold }]}>{t('demoDriver')}</Text>
        <Body muted>{t('demoStats')}</Body>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['idVerified', 'licenseVerified', 'carVerified'] as const).map((k) => (
          <View key={k} style={styles.badge}>
            <Icon name="sealCheck" size={12} />
            <Text style={[styles.badgeText, { fontFamily: f.medium }]}>{t(k)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.plate}>
        <Text style={[styles.plateText, { fontFamily: fonts.en.bold }]}>4-0521-H</Text>
        <View style={styles.plateSide}>
          <Text style={[styles.plateSideText, { fontFamily: fonts.en.bold }]}>P</Text>
        </View>
      </View>
    </View>
  );
}

/** Slide 3: checkpoints along the road, on a graphite map. */
function CheckpointSlide() {
  const { t } = useT();
  const { f } = useFont();
  const points = [
    { name: t('cpZaatara'), status: t('statusCrowded'), color: colors.statusCrowdedDot, top: 70, side: 'right' as const },
    { name: t('cpHuwara'), status: t('statusClosed'), color: '#E0566A', top: 160, side: 'left' as const },
    { name: t('cpAttara'), status: t('statusOpen'), color: '#4FB27A', top: 250, side: 'right' as const },
  ];
  return (
    <View style={styles.map}>
      {/* the road */}
      <View style={styles.road} />
      <View style={[styles.mapCity, { top: 18 }]}>
        <Text style={[styles.mapLabel, { fontFamily: f.medium }]}>{t('nablus')}</Text>
      </View>
      <View style={[styles.mapCity, { bottom: 18 }]}>
        <Text style={[styles.mapLabel, { fontFamily: f.medium }]}>{t('ramallah')}</Text>
      </View>
      {points.map((p) => (
        <View key={p.name} style={[styles.mapPoint, { top: p.top }]}>
          <View style={[styles.mapDot, { backgroundColor: p.color }]} />
          <View style={[styles.mapPill, p.side === 'right' ? { left: 26 } : { right: 26 }]}>
            <Text style={[styles.mapPillText, { fontFamily: f.medium }]}>
              {p.name} <Text style={{ color: p.color }}>{p.status}</Text>
            </Text>
          </View>
        </View>
      ))}
    </View>
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

  orText: { fontSize: 13, color: colors.inkSecondary, textAlign: 'center', marginTop: space.xs },
  way: {
    flex: 1,
    height: sizes.control,
    borderRadius: radii.capsule,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  wayText: { fontSize: 15, color: colors.ink },

  hero: { height: 340, marginTop: space.sm },
  slideTitle: { fontSize: 28, lineHeight: 36, color: colors.ink, letterSpacing: -0.4, marginTop: space.lg },
  dots: { flexDirection: 'row', gap: 2, marginStart: -12 },
  dotHit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  dotOn: { width: 22, backgroundColor: colors.ink },

  rail: { alignItems: 'center', paddingTop: 22 },
  railStart: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: colors.surface },
  railLine: { width: 2, height: 118, backgroundColor: colors.ink },
  railEnd: { width: 14, height: 14, borderRadius: 3, backgroundColor: colors.ink },
  car: {
    position: 'absolute',
    top: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ink,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTime: { fontFamily: fonts.en.bold, fontSize: 56, lineHeight: 60, color: colors.ink, letterSpacing: -1.6 },
  cpPill: {
    position: 'absolute',
    top: 118,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontSize: 13, color: colors.ink },
  seatCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.container,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  seatTitle: { fontSize: 15, color: colors.ink },
  seat: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  bigAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  bigAvatarText: { fontSize: 34, color: colors.ink },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ink,
    borderWidth: 3,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: { fontSize: 22, color: colors.ink },
  badge: {
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: { fontSize: 11, color: colors.ink },
  plate: {
    marginTop: space.sm,
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'stretch',
    height: 56,
    borderRadius: radii.plate,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  plateText: { fontSize: 30, letterSpacing: 2, color: colors.plateInk, paddingHorizontal: 18, alignSelf: 'center' },
  plateSide: { width: 34, backgroundColor: colors.plateInk, alignItems: 'center', justifyContent: 'center' },
  plateSideText: { color: '#FFFFFF', fontSize: 16 },

  map: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#25272B', borderWidth: 1, borderColor: colors.hairline },
  road: { position: 'absolute', top: 40, bottom: 40, left: '50%', width: 4, marginLeft: -2, borderRadius: 2, backgroundColor: '#FFFFFF' },
  mapCity: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 2 },
  mapLabel: { fontSize: 12, color: '#A9ACB2' },
  mapPoint: { position: 'absolute', left: '50%', marginLeft: -9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  mapDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: '#17191C' },
  mapPill: {
    position: 'absolute',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#17191C',
    borderWidth: 1,
    borderColor: '#3E4147',
    justifyContent: 'center',
    width: 120,
  },
  mapPillText: { fontSize: 12, color: '#FFFFFF', textAlign: 'center' },
});
